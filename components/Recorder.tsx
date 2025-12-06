import React, { useRef, useState, useCallback, useEffect } from 'react';
import { 
  Camera, Mic, Square, RefreshCw, Upload, Sparkles, Check, 
  AlertCircle, Plus, Trash2, Film, Type, Play, Pause, 
  Scissors, ChevronLeft, ChevronRight, Save, ArrowLeft, ArrowRight,
  X, PenTool, GripVertical, Cloud, CloudOff, Loader2, RefreshCcw
} from 'lucide-react';
import { Button } from './Button';
import { analyzeVlogContent } from '../services/geminiService';
import { saveDraftToDB, getDraftFromDB, clearDraftFromDB, DraftData } from '../services/draftService';

// --- Types ---

interface Clip {
  id: string;
  blob: Blob;
  url: string;
  originalDuration: number;
  trimStart: number; // seconds from start of this clip
  trimEnd: number;   // seconds from start of this clip
}

interface Caption {
  id: string;
  text: string;
  startTime: number; // seconds on global timeline
  duration: number;  // seconds
  style: 'subtitle' | 'title';
}

interface RecorderProps {
  onComplete: (file: Blob, metadata: { title: string; transcription: string; summary: string }) => void;
  onCancel: () => void;
}

// --- Constants ---
const MAX_DURATION = 120; // 2 minutes max

// --- Helper: Get Video Duration ---
const getVideoDuration = (blob: Blob): Promise<number> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.src = URL.createObjectURL(blob);
  });
};

const getSupportedMimeType = () => {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
};

// --- Helper: Blob Conversion ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const base64ToBlob = async (base64: string): Promise<Blob> => {
  const res = await fetch(base64);
  return res.blob();
};

export const Recorder: React.FC<RecorderProps> = ({ onComplete, onCancel }) => {
  // --- State ---
  const [mode, setMode] = useState<'capture' | 'edit' | 'review'>('capture');
  const [clips, setClips] = useState<Clip[]>([]);
  const [captions, setCaptions] = useState<Caption[]>([]);
  
  // Metadata State
  const [vlogTitle, setVlogTitle] = useState("");
  const [vlogDescription, setVlogDescription] = useState("");

  // Auto-Save State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [draftFound, setDraftFound] = useState<{ count: number, time: number } | null>(null);

  // Capture State
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedRecording, setElapsedRecording] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Edit/Player State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clips' | 'captions'>('clips');

  // Trimming Interaction State
  const [draggingHandle, setDraggingHandle] = useState<{ clipId: string, type: 'start' | 'end' } | null>(null);
  const trimTrackRef = useRef<HTMLDivElement>(null);
  
  // Processing State
  const [isRendering, setIsRendering] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // --- Derived State ---
  const totalDuration = clips.reduce((acc, clip) => acc + (clip.trimEnd - clip.trimStart), 0);

  // ==========================================
  // DRAFT LOGIC (Check on Mount)
  // ==========================================
  useEffect(() => {
    const checkDraft = async () => {
      const draft = await getDraftFromDB();
      if (draft && draft.clips.length > 0) {
        setDraftFound({ count: draft.clips.length, time: draft.updatedAt });
      }
    };
    checkDraft();
  }, []);

  const restoreDraft = async () => {
    try {
      const draft = await getDraftFromDB();
      if (draft) {
        setMode('edit'); // Switch to edit mode immediately to show loading
        const restoredClips = await Promise.all(draft.clips.map(async (c) => {
          const blob = await base64ToBlob(c.base64);
          return {
            id: c.id,
            blob,
            url: URL.createObjectURL(blob),
            originalDuration: c.originalDuration,
            trimStart: c.trimStart,
            trimEnd: c.trimEnd
          };
        }));

        setClips(restoredClips);
        setCaptions(draft.captions);
        setVlogTitle(draft.vlogTitle);
        setVlogDescription(draft.vlogDescription);
        setLastSaved(draft.updatedAt);
        setDraftFound(null);
      }
    } catch (err) {
      console.error("Failed to restore draft:", err);
      alert("Could not restore the draft. It may be corrupted.");
      await clearDraftFromDB();
      setDraftFound(null);
    }
  };

  const discardDraft = async () => {
    await clearDraftFromDB();
    setDraftFound(null);
  };

  // Auto-save effect
  useEffect(() => {
    if (clips.length === 0) return;

    setSaveStatus('unsaved');
    const handler = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const serializedClips = await Promise.all(clips.map(async (clip) => ({
          id: clip.id,
          base64: await blobToBase64(clip.blob),
          originalDuration: clip.originalDuration,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd
        })));

        const draftData: DraftData = {
          clips: serializedClips,
          captions,
          vlogTitle,
          vlogDescription,
          updatedAt: Date.now()
        };
        
        await saveDraftToDB(draftData);
        setSaveStatus('saved');
        setLastSaved(Date.now());
      } catch (err) {
        console.error("Auto-save failed:", err);
        setSaveStatus('error');
      }
    }, 3000); // Debounce 3 seconds to avoid spamming large writes

    return () => clearTimeout(handler);
  }, [clips, captions, vlogTitle, vlogDescription]);

  const forceSave = async () => {
    if (clips.length === 0) return;
    setSaveStatus('saving');
    try {
        const serializedClips = await Promise.all(clips.map(async (clip) => ({
          id: clip.id,
          base64: await blobToBase64(clip.blob),
          originalDuration: clip.originalDuration,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd
        })));

        const draftData: DraftData = {
          clips: serializedClips,
          captions,
          vlogTitle,
          vlogDescription,
          updatedAt: Date.now()
        };
        await saveDraftToDB(draftData);
        setSaveStatus('saved');
        setLastSaved(Date.now());
    } catch (err) {
        console.error("Force save failed:", err);
        alert("Failed to save draft.");
    }
  };

  // ==========================================
  // 0. TRIM DRAG HANDLER
  // ==========================================
  useEffect(() => {
    if (!draggingHandle) return;

    const handleMouseMove = (e: MouseEvent) => {
        if (!trimTrackRef.current) return;
        const rect = trimTrackRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        
        const clip = clips.find(c => c.id === draggingHandle.clipId);
        if (!clip) return;

        const newTime = pct * clip.originalDuration;

        if (draggingHandle.type === 'start') {
            const maxStart = clip.trimEnd - 0.5;
            const validStart = Math.min(newTime, maxStart);
            updateClipTrim(clip.id, validStart, clip.trimEnd);
        } else {
            const minEnd = clip.trimStart + 0.5;
            const validEnd = Math.max(newTime, minEnd);
            updateClipTrim(clip.id, clip.trimStart, validEnd);
        }
    };

    const handleMouseUp = () => {
        setDraggingHandle(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingHandle, clips]);

  // ==========================================
  // 1. CAPTURE LOGIC
  // ==========================================

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setCameraError("Camera access denied. Please upload clips instead.");
    }
  }, []);

  useEffect(() => {
    if (mode === 'capture') {
      startCamera();
    } else {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
  }, [mode]);

  useEffect(() => {
    let interval: number;
    if (isRecording) {
      interval = window.setInterval(() => setElapsedRecording(p => p + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = () => {
    if (!stream) return;
    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const duration = await getVideoDuration(blob);
      const newClip: Clip = {
        id: `clip-${Date.now()}`,
        blob,
        url: URL.createObjectURL(blob),
        originalDuration: duration,
        trimStart: 0,
        trimEnd: duration
      };
      setClips(prev => [...prev, newClip]);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    setElapsedRecording(0);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const duration = await getVideoDuration(file);
      const newClip: Clip = {
        id: `clip-${Date.now()}-${Math.random()}`,
        blob: file,
        url: URL.createObjectURL(file),
        originalDuration: duration,
        trimStart: 0,
        trimEnd: duration
      };
      setClips(prev => [...prev, newClip]);
      e.target.value = '';
    }
  };

  const deleteClip = (id: string) => {
    setClips(prev => prev.filter(c => c.id !== id));
    if (selectedClipId === id) setSelectedClipId(null);
  };

  const moveClip = (index: number, direction: 'left' | 'right') => {
    if (direction === 'left' && index > 0) {
      const newClips = [...clips];
      [newClips[index - 1], newClips[index]] = [newClips[index], newClips[index - 1]];
      setClips(newClips);
    } else if (direction === 'right' && index < clips.length - 1) {
      const newClips = [...clips];
      [newClips[index], newClips[index + 1]] = [newClips[index + 1], newClips[index]];
      setClips(newClips);
    }
  };

  // ==========================================
  // 2. PLAYER & EDITOR LOGIC
  // ==========================================

  useEffect(() => {
    if (mode !== 'edit') return;
    
    let animationFrameId: number;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const video = hiddenVideoRef.current;

    if (!canvas || !ctx || !video) return;

    canvas.width = 1280;
    canvas.height = 720;

    const renderFrame = () => {
      let timePointer = 0;
      let activeClip: Clip | null = null;
      let timeInClip = 0;

      for (const clip of clips) {
        const clipDuration = clip.trimEnd - clip.trimStart;
        if (currentTime >= timePointer && currentTime < timePointer + clipDuration) {
          activeClip = clip;
          timeInClip = (currentTime - timePointer) + clip.trimStart;
          break;
        }
        timePointer += clipDuration;
      }

      if (!activeClip && clips.length > 0 && currentTime >= totalDuration) {
        setIsPlaying(false);
        setCurrentTime(0); 
        return; 
      }

      if (activeClip) {
        if (video.getAttribute('data-clip-id') !== activeClip.id) {
            video.src = activeClip.url;
            video.setAttribute('data-clip-id', activeClip.id);
            video.currentTime = timeInClip;
            video.play().catch(() => {});
        }
        
        if (Math.abs(video.currentTime - timeInClip) > 0.3) {
            video.currentTime = timeInClip;
        }
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      captions.forEach(caption => {
        if (currentTime >= caption.startTime && currentTime <= (caption.startTime + caption.duration)) {
          ctx.font = caption.style === 'title' ? 'bold 60px Inter, sans-serif' : 'bold 36px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'white';
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 4;
          
          const x = canvas.width / 2;
          const y = caption.style === 'title' ? canvas.height / 2 : canvas.height - 100;

          ctx.strokeText(caption.text, x, y);
          ctx.fillText(caption.text, x, y);
        }
      });

      if (isPlaying) {
        setCurrentTime(prev => Math.min(prev + 0.033, totalDuration + 0.1)); 
        animationFrameId = requestAnimationFrame(renderFrame);
      } else {
        animationFrameId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => cancelAnimationFrame(animationFrameId);
  }, [mode, isPlaying, currentTime, clips, captions, totalDuration]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const addCaption = () => {
    const newCaption: Caption = {
      id: `cap-${Date.now()}`,
      text: "New Text",
      startTime: Math.max(0, currentTime),
      duration: 3,
      style: 'subtitle'
    };
    setCaptions([...captions, newCaption]);
    setSelectedCaptionId(newCaption.id);
    setActiveTab('captions');
  };

  const updateCaption = (id: string, updates: Partial<Caption>) => {
    setCaptions(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeCaption = (id: string) => {
    setCaptions(prev => prev.filter(c => c.id !== id));
    if (selectedCaptionId === id) setSelectedCaptionId(null);
  };

  const updateClipTrim = (id: string, start: number, end: number) => {
    setClips(prev => prev.map(c => c.id === id ? { ...c, trimStart: start, trimEnd: end } : c));
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setCurrentTime(percentage * totalDuration);
    setIsPlaying(false);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleReviewClick = () => {
      if (totalDuration > MAX_DURATION) {
          alert(`Video length (${formatTime(totalDuration)}) exceeds the 2-minute limit! Please trim your clips.`);
          return;
      }
      setMode('review');
  };

  // ==========================================
  // 3. ROBUST RENDERER
  // ==========================================
  
  const handleRenderAndSubmit = async () => {
    if (clips.length === 0) return;
    setIsRendering(true);
    
    // Auto-save before render as a backup
    // await forceSave(); // Removed explicit forceSave to avoid blocking UI

    const renderVideo = document.createElement('video');
    renderVideo.muted = false; 
    renderVideo.crossOrigin = 'anonymous';
    renderVideo.playsInline = true;

    renderVideo.style.position = 'fixed';
    renderVideo.style.top = '-9999px';
    renderVideo.style.left = '-9999px';
    renderVideo.style.opacity = '0';
    renderVideo.style.pointerEvents = 'none';
    document.body.appendChild(renderVideo);

    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = 1280;
    renderCanvas.height = 720;
    const ctx = renderCanvas.getContext('2d')!;

    const captionCache = new Map<string, HTMLCanvasElement>();
    captions.forEach(caption => {
        const c = document.createElement('canvas');
        c.width = 1280;
        c.height = 720;
        const cx = c.getContext('2d');
        if (cx) {
            cx.font = caption.style === 'title' ? 'bold 60px Inter, sans-serif' : 'bold 36px Inter, sans-serif';
            cx.textAlign = 'center';
            cx.fillStyle = 'white';
            cx.strokeStyle = 'black';
            cx.lineWidth = 4;
            
            const x = c.width / 2;
            const y = caption.style === 'title' ? c.height / 2 : c.height - 100;

            cx.strokeText(caption.text, x, y);
            cx.fillText(caption.text, x, y);
        }
        captionCache.set(caption.id, c);
    });

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    
    await audioCtx.resume();
    
    const dest = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createMediaElementSource(renderVideo);
    source.connect(dest);
    
    const canvasStream = renderCanvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    const mimeType = getSupportedMimeType();
    const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const finalBlob = new Blob(chunks, { type: mimeType });
      
      try {
          if(audioCtx.state !== 'closed') await audioCtx.close();
      } catch(e) {}

      if (renderVideo.parentNode) {
          document.body.removeChild(renderVideo);
      }
      
      setIsRendering(false);
      setIsAnalyzing(true);
      
      try {
        const metadata = await analyzeVlogContent(finalBlob);
        const finalMetadata = {
          title: vlogTitle.trim() || metadata.title,
          summary: vlogDescription.trim() || metadata.summary,
          transcription: metadata.transcription
        };
        await clearDraftFromDB();
        onComplete(finalBlob, finalMetadata);
      } catch (e) {
        console.error("Gemini failed", e);
        setIsAnalyzing(false);
        await clearDraftFromDB();
        onComplete(finalBlob, { 
            title: vlogTitle || "Daily Vlog", 
            summary: vlogDescription || "No summary available.", 
            transcription: "" 
        });
      }
    };

    mediaRecorder.start();
    mediaRecorder.pause();

    let globalTimeOffset = 0;

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      renderVideo.src = clip.url;
      renderVideo.currentTime = clip.trimStart;

      await new Promise<void>((resolve) => {
        const onCanPlay = () => {
          renderVideo.removeEventListener('seeked', onCanPlay);
          resolve();
        };
        setTimeout(resolve, 1000); 
        renderVideo.addEventListener('seeked', onCanPlay);
      });

      mediaRecorder.resume();
      await renderVideo.play();

      await new Promise<void>((resolve) => {
        const step = () => {
          if (renderVideo.paused || renderVideo.ended) {
            resolve();
            return;
          }

          if (renderVideo.currentTime >= clip.trimEnd) {
            renderVideo.pause();
            resolve();
            return;
          }

          ctx.drawImage(renderVideo, 0, 0, renderCanvas.width, renderCanvas.height);

          const currentGlobalTime = globalTimeOffset + (renderVideo.currentTime - clip.trimStart);
          captions.forEach(caption => {
            if (currentGlobalTime >= caption.startTime && currentGlobalTime <= (caption.startTime + caption.duration)) {
              const cachedCanvas = captionCache.get(caption.id);
              if (cachedCanvas) {
                  ctx.drawImage(cachedCanvas, 0, 0);
              }
            }
          });

          setRenderProgress((currentGlobalTime / totalDuration) * 100);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      mediaRecorder.pause();
      globalTimeOffset += (clip.trimEnd - clip.trimStart);
    }

    mediaRecorder.stop();
  };

  // ==========================================
  // RENDER UI
  // ==========================================

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-in fade-in duration-300">
      
      {/* Hidden Elements */}
      <video ref={hiddenVideoRef} className="hidden" muted playsInline crossOrigin="anonymous" />
      <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={handleFileUpload} />

      {/* --- HEADER --- */}
      <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-4">
            <button onClick={onCancel} className="text-slate-400 hover:text-white mr-2">Cancel</button>
            {/* Auto-Save Status */}
            {clips.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                    {saveStatus === 'saving' && (
                        <>
                            <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
                            <span className="text-slate-500">Saving...</span>
                        </>
                    )}
                    {saveStatus === 'saved' && (
                        <>
                            <Cloud className="h-3 w-3 text-emerald-500" />
                            <span className="text-slate-500">Saved</span>
                        </>
                    )}
                    {saveStatus === 'unsaved' && (
                        <>
                            <CloudOff className="h-3 w-3 text-slate-500" />
                            <span className="text-slate-500">Not Saved</span>
                        </>
                    )}
                    {saveStatus === 'error' && (
                        <>
                            <AlertCircle className="h-3 w-3 text-red-500" />
                            <span className="text-red-500" title="Video too large for browser storage">Storage Full</span>
                        </>
                    )}
                </div>
            )}
        </div>

        <div className="flex bg-slate-800 rounded-lg p-1">
           <button 
             onClick={() => setMode('capture')}
             className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'capture' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
           >
             Record
           </button>
           <button 
             onClick={() => {
                if(clips.length === 0) {
                    alert("Record or upload at least one clip first.");
                    return;
                }
                setMode('edit');
             }}
             className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'edit' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
           >
             Edit ({clips.length})
           </button>
        </div>
        <div className="min-w-[4rem] flex justify-end gap-2">
            {mode === 'edit' && (
                <>
                <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={forceSave}
                    className="mr-2 border-indigo-500/30 text-indigo-300"
                    title="Force Save to Cloud"
                >
                   <Save className="h-4 w-4 mr-2" /> Save
                </Button>
                <Button 
                    size="sm" 
                    onClick={handleReviewClick}
                    disabled={clips.length === 0}
                >
                   Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                </>
            )}
        </div>
      </div>

      {/* --- DRAFT RESTORE BANNER --- */}
      {draftFound && mode === 'capture' && (
          <div className="absolute top-20 left-4 right-4 z-50 animate-in slide-in-from-top-2">
              <div className="bg-slate-800 border border-indigo-500/50 rounded-xl p-4 shadow-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-500/20 rounded-lg">
                          <RefreshCcw className="h-5 w-5 text-indigo-400" />
                      </div>
                      <div>
                          <h4 className="text-sm font-bold text-white">Draft Found</h4>
                          <p className="text-xs text-slate-400">
                              {draftFound.count} clips from {new Date(draftFound.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={discardDraft} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                          Discard
                      </button>
                      <Button size="sm" onClick={restoreDraft}>
                          Restore Draft
                      </Button>
                  </div>
              </div>
          </div>
      )}

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        
        {/* VIEW 1: CAPTURE */}
        {mode === 'capture' && (
            <div className="flex-1 flex flex-col relative bg-black">
                {/* Camera View */}
                <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                    {cameraError ? (
                        <div className="text-center p-8">
                            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                            <p className="text-slate-300 mb-6">{cameraError}</p>
                            <Button onClick={() => fileInputRef.current?.click()} variant="secondary">
                                <Upload className="h-4 w-4 mr-2" /> Upload Video
                            </Button>
                        </div>
                    ) : (
                        <video ref={videoPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    )}
                    
                    {/* Recording Controls */}
                    <div className="absolute bottom-8 w-full flex justify-center items-center gap-8 z-10">
                         <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isRecording}
                            className={`h-12 w-12 rounded-full bg-slate-800/60 backdrop-blur border border-slate-600 flex items-center justify-center text-white hover:bg-slate-700 transition-all ${isRecording ? 'opacity-0 pointer-events-none' : ''}`}
                         >
                            <Upload className="h-5 w-5" />
                         </button>

                         <button 
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`h-20 w-20 rounded-full border-4 border-white flex items-center justify-center transition-all transform hover:scale-105 ${isRecording ? 'bg-red-600' : 'bg-red-600'}`}
                         >
                            {isRecording ? <Square className="h-8 w-8 text-white fill-current" /> : <div className="h-4 w-4 bg-white rounded-full opacity-0 group-hover:opacity-100" />}
                         </button>
                         
                         <div className="w-12 flex justify-center">
                            {isRecording && <span className="text-red-500 font-mono font-bold animate-pulse">{formatTime(elapsedRecording)}</span>}
                         </div>
                    </div>
                </div>

                {/* Clips Drawer */}
                <div className="h-32 bg-slate-900 border-t border-slate-800 p-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Captured Shots ({clips.length})</h3>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                        {clips.length === 0 && (
                            <div className="flex items-center justify-center w-full h-20 text-slate-600 text-sm border border-dashed border-slate-700 rounded-lg">
                                No clips yet. Record or upload!
                            </div>
                        )}
                        {clips.map((clip, idx) => (
                            <div key={clip.id} className="relative flex-shrink-0 w-24 h-20 bg-slate-800 rounded-lg overflow-hidden border border-slate-700 group">
                                <video src={clip.url} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-col gap-2">
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => moveClip(idx, 'left')} 
                                            disabled={idx === 0}
                                            className="p-1 bg-black/50 rounded-full text-white hover:bg-black disabled:opacity-30"
                                        >
                                            <ArrowLeft className="h-3 w-3" />
                                        </button>
                                        <button 
                                            onClick={() => moveClip(idx, 'right')} 
                                            disabled={idx === clips.length - 1}
                                            className="p-1 bg-black/50 rounded-full text-white hover:bg-black disabled:opacity-30"
                                        >
                                            <ArrowRight className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <button onClick={() => deleteClip(clip.id)} className="p-1 bg-red-600 rounded-full text-white">
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                                <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 px-1 rounded text-white">
                                    {formatTime(clip.trimEnd - clip.trimStart)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* VIEW 2: EDIT */}
        {mode === 'edit' && (
            <div className="flex-1 flex flex-col bg-slate-950">
                {/* Canvas Preview Area */}
                <div className="flex-1 relative flex items-center justify-center bg-black/50 p-4 min-h-0">
                    <canvas 
                        ref={canvasRef} 
                        className="max-h-full max-w-full aspect-video bg-black shadow-2xl rounded-lg"
                    />
                </div>

                {/* VISUAL TIMELINE EDITOR */}
                <div className="bg-slate-900 border-t border-slate-800 p-2 select-none">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-2">
                             <button onClick={togglePlay} className="text-white hover:text-indigo-400 bg-slate-800 rounded-full p-2">
                                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                             </button>
                             <span className={`text-xs font-mono ${totalDuration > MAX_DURATION ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                {formatTime(currentTime)} / {formatTime(totalDuration)}
                             </span>
                             {totalDuration > MAX_DURATION && (
                                 <span className="text-[10px] text-red-500 font-medium bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                                     Max 2m
                                 </span>
                             )}
                        </div>
                        <Button onClick={addCaption} size="sm" variant="secondary" className="py-1 text-xs">
                           <Plus className="h-3 w-3 mr-1" /> Add Text
                        </Button>
                    </div>

                    {/* Timeline Container */}
                    <div className="relative h-24 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden cursor-pointer" onClick={handleTimelineClick}>
                        
                        {/* Playhead */}
                        <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none transition-all duration-75"
                            style={{ left: `${totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0}%` }}
                        >
                             <div className="absolute -top-1 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow" />
                        </div>

                        {/* Tracks */}
                        <div className="absolute inset-0 flex flex-col pointer-events-none">
                            {/* Video Track */}
                            <div className="h-1/2 bg-slate-800/50 flex border-b border-slate-800">
                                {clips.map((clip, idx) => {
                                    const duration = clip.trimEnd - clip.trimStart;
                                    const widthPct = (duration / totalDuration) * 100;
                                    return (
                                        <div 
                                            key={clip.id}
                                            className={`h-full border-r border-slate-900 box-border relative group pointer-events-auto hover:brightness-110 transition-colors ${selectedClipId === clip.id ? 'bg-indigo-600' : 'bg-indigo-900/60'}`}
                                            style={{ width: `${widthPct}%` }}
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setSelectedClipId(clip.id); 
                                                setActiveTab('clips'); 
                                            }}
                                        >
                                            <span className="absolute top-1 left-1 text-[9px] font-bold text-white/70 truncate px-1 shadow-sm">Clip {idx + 1}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {/* Caption Track */}
                            <div className="h-1/2 bg-slate-900/50 relative">
                                {captions.map((cap) => {
                                    const leftPct = (cap.startTime / totalDuration) * 100;
                                    const widthPct = (cap.duration / totalDuration) * 100;
                                    const isSelected = selectedCaptionId === cap.id;
                                    return (
                                        <div 
                                            key={cap.id}
                                            className={`absolute top-2 bottom-2 rounded text-[10px] text-white overflow-hidden whitespace-nowrap px-1 pointer-events-auto border flex items-center shadow-sm transition-all ${isSelected ? 'bg-yellow-500 border-white z-10' : 'bg-yellow-600/80 border-yellow-400/30 hover:bg-yellow-500'}`}
                                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setSelectedCaptionId(cap.id);
                                                setActiveTab('captions'); 
                                            }}
                                        >
                                            <Type className="h-3 w-3 mr-1 opacity-70" />
                                            {cap.text}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Editor Tabs & Panel */}
                <div className="h-48 bg-slate-900 border-t border-slate-800 flex flex-col">
                    <div className="flex border-b border-slate-800">
                        <button 
                           onClick={() => setActiveTab('clips')}
                           className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-2 ${activeTab === 'clips' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/50' : 'text-slate-400 hover:text-white'}`}
                        >
                           <Scissors className="h-3 w-3" /> Clip Trimmer
                        </button>
                        <button 
                           onClick={() => setActiveTab('captions')}
                           className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-2 ${activeTab === 'captions' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/50' : 'text-slate-400 hover:text-white'}`}
                        >
                           <Type className="h-3 w-3" /> Caption Editor
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {activeTab === 'clips' && (
                            <div className="space-y-4">
                                {selectedClipId ? (
                                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 animate-in slide-in-from-bottom-2">
                                        {(() => {
                                            const clip = clips.find(c => c.id === selectedClipId);
                                            if(!clip) return <p className="text-xs text-slate-500">Clip not found.</p>;
                                            const durationPct = ((clip.trimEnd - clip.trimStart) / clip.originalDuration) * 100;
                                            const startPct = (clip.trimStart / clip.originalDuration) * 100;

                                            return (
                                                <div className="space-y-6">
                                                    <div className="flex justify-between items-center">
                                                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                                            Editing Clip
                                                        </h4>
                                                        <div className="flex items-center gap-3 text-xs">
                                                            <div className="px-2 py-1 rounded bg-slate-700 text-slate-300">
                                                                Original: <span className="font-mono text-white">{clip.originalDuration.toFixed(1)}s</span>
                                                            </div>
                                                            <ArrowRight className="h-3 w-3 text-slate-600" />
                                                            <div className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                                                Trimmed: <span className="font-mono text-indigo-100 font-bold">{(clip.trimEnd - clip.trimStart).toFixed(1)}s</span>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => deleteClip(clip.id)} 
                                                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 bg-red-900/20 px-2 py-1 rounded transition-colors"
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </button>
                                                    </div>

                                                    {/* Visual Timeline & Handles */}
                                                    <div 
                                                        className="relative pt-6 pb-2 px-2 select-none h-20" 
                                                        ref={trimTrackRef}
                                                    >
                                                        {/* Track Background */}
                                                        <div className="absolute top-2 left-0 right-0 h-12 bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
                                                            <div className="absolute inset-0 opacity-20 bg-[linear-gradient(90deg,transparent_49%,rgba(255,255,255,0.1)_50%,transparent_51%)] bg-[length:10px_100%]"></div>
                                                        </div>

                                                        {/* Active Region (Highlighted) */}
                                                        <div 
                                                            className="absolute top-2 h-12 bg-indigo-500/20 border-t-2 border-b-2 border-indigo-500 box-border pointer-events-none"
                                                            style={{
                                                                left: `${startPct}%`,
                                                                width: `${durationPct}%`
                                                            }}
                                                        ></div>

                                                        {/* Start Handle (Visual) */}
                                                        <div 
                                                            className="absolute top-0 bottom-0 w-8 -ml-4 flex flex-col items-center justify-center cursor-ew-resize z-20 group hover:scale-105 transition-transform active:scale-95 touch-none"
                                                            style={{ left: `${startPct}%` }}
                                                            onMouseDown={(e) => { e.stopPropagation(); setDraggingHandle({ clipId: clip.id, type: 'start' }); }}
                                                        >
                                                            <div className="w-1 h-full bg-indigo-500/50 absolute left-1/2 -translate-x-1/2 group-hover:bg-indigo-400" />
                                                            <div className="relative bg-indigo-600 w-8 h-8 rounded-full shadow-lg border-2 border-white flex items-center justify-center">
                                                                <GripVertical className="h-4 w-4 text-white" />
                                                            </div>
                                                            <div className="mt-1 px-1.5 py-0.5 bg-black/80 rounded text-[10px] font-mono font-bold text-white whitespace-nowrap opacity-80 group-hover:opacity-100">
                                                                {clip.trimStart.toFixed(1)}s
                                                            </div>
                                                        </div>

                                                        {/* End Handle (Visual) */}
                                                        <div 
                                                            className="absolute top-0 bottom-0 w-8 -ml-4 flex flex-col items-center justify-center cursor-ew-resize z-20 group hover:scale-105 transition-transform active:scale-95 touch-none"
                                                            style={{ left: `${startPct + durationPct}%` }}
                                                            onMouseDown={(e) => { e.stopPropagation(); setDraggingHandle({ clipId: clip.id, type: 'end' }); }}
                                                        >
                                                            <div className="w-1 h-full bg-indigo-500/50 absolute left-1/2 -translate-x-1/2 group-hover:bg-indigo-400" />
                                                            <div className="relative bg-indigo-600 w-8 h-8 rounded-full shadow-lg border-2 border-white flex items-center justify-center">
                                                                <GripVertical className="h-4 w-4 text-white" />
                                                            </div>
                                                            <div className="mt-1 px-1.5 py-0.5 bg-black/80 rounded text-[10px] font-mono font-bold text-white whitespace-nowrap opacity-80 group-hover:opacity-100">
                                                                {clip.trimEnd.toFixed(1)}s
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Fallback Inputs for Precision */}
                                                    <div className="flex gap-4">
                                                        <div className="flex-1">
                                                            <label className="text-xs text-slate-500 mb-1 block">Start Time</label>
                                                            <input 
                                                                type="range"
                                                                min="0"
                                                                max={clip.originalDuration}
                                                                step="0.1"
                                                                value={clip.trimStart}
                                                                onChange={(e) => {
                                                                    const val = parseFloat(e.target.value);
                                                                    if(val < clip.trimEnd - 0.5) updateClipTrim(clip.id, val, clip.trimEnd);
                                                                }}
                                                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                                            />
                                                        </div>
                                                        <div className="flex-1">
                                                            <label className="text-xs text-slate-500 mb-1 block text-right">End Time</label>
                                                            <input 
                                                                type="range"
                                                                min="0"
                                                                max={clip.originalDuration}
                                                                step="0.1"
                                                                value={clip.trimEnd}
                                                                onChange={(e) => {
                                                                    const val = parseFloat(e.target.value);
                                                                    if(val > clip.trimStart + 0.5) updateClipTrim(clip.id, clip.trimStart, val);
                                                                }}
                                                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <div className="text-center text-slate-500 py-4 text-sm">
                                        Select a clip on the timeline above to edit handles.
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'captions' && (
                            <div className="space-y-4">
                                {selectedCaptionId ? (
                                    (() => {
                                        const cap = captions.find(c => c.id === selectedCaptionId);
                                        if(!cap) return <p className="text-xs text-slate-500">Caption not found.</p>;
                                        return (
                                            <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex flex-col gap-3">
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        value={cap.text}
                                                        onChange={(e) => updateCaption(cap.id, { text: e.target.value })}
                                                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none"
                                                        placeholder="Caption text..."
                                                    />
                                                    <select 
                                                        value={cap.style}
                                                        onChange={(e) => updateCaption(cap.id, { style: e.target.value as any })}
                                                        className="bg-slate-900 border border-slate-700 rounded px-2 text-sm text-white"
                                                    >
                                                        <option value="subtitle">Subtitle</option>
                                                        <option value="title">Big Title</option>
                                                    </select>
                                                    <button onClick={() => removeCaption(cap.id)} className="text-red-400 hover:text-red-300">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                                <div className="flex gap-4 text-xs items-center text-slate-400">
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <span>Start Time:</span>
                                                        <input 
                                                            type="range"
                                                            min="0"
                                                            max={totalDuration}
                                                            step="0.1"
                                                            value={cap.startTime}
                                                            onChange={(e) => updateCaption(cap.id, { startTime: parseFloat(e.target.value) })}
                                                            className="flex-1"
                                                        />
                                                        <span className="w-8 text-right">{cap.startTime.toFixed(1)}s</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <span>Duration:</span>
                                                        <input 
                                                            type="range"
                                                            min="1"
                                                            max={10}
                                                            step="0.5"
                                                            value={cap.duration}
                                                            onChange={(e) => updateCaption(cap.id, { duration: parseFloat(e.target.value) })}
                                                            className="flex-1"
                                                        />
                                                        <span className="w-8 text-right">{cap.duration.toFixed(1)}s</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="text-center text-slate-500 py-4 text-sm">
                                        Click "+ Add Text" or select a caption on the timeline.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* VIEW 3: REVIEW */}
        {mode === 'review' && (
           <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-950">
               <div className="w-full max-w-md space-y-6">
                   <div className="text-center">
                       <h2 className="text-2xl font-bold text-white mb-2">Final Details</h2>
                       <p className="text-slate-400">Add info before publishing your masterpiece.</p>
                   </div>
                   
                   <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
                       <div>
                           <label className="block text-sm font-medium text-slate-300 mb-1">Vlog Title</label>
                           <input 
                               type="text" 
                               value={vlogTitle}
                               onChange={(e) => setVlogTitle(e.target.value)}
                               className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-600"
                               placeholder="e.g., Coffee Run Adventures"
                           />
                           <p className="text-xs text-slate-500 mt-1">Leave blank to let AI generate one.</p>
                       </div>
                       
                       <div>
                           <label className="block text-sm font-medium text-slate-300 mb-1">Description / Summary</label>
                           <textarea 
                               value={vlogDescription}
                               onChange={(e) => setVlogDescription(e.target.value)}
                               className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none placeholder:text-slate-600"
                               placeholder="Briefly describe what happened..."
                           />
                           <p className="text-xs text-slate-500 mt-1">Leave blank to let AI summarize it.</p>
                       </div>
                   </div>

                   <div className="flex gap-3">
                       <Button variant="secondary" onClick={() => setMode('edit')} className="flex-1">
                           <ArrowLeft className="h-4 w-4 mr-2" /> Back to Edit
                       </Button>
                       <Button onClick={handleRenderAndSubmit} className="flex-[2] shadow-indigo-500/25">
                           Render & Publish <Upload className="h-4 w-4 ml-2" />
                       </Button>
                   </div>
               </div>
           </div>
        )}

        {/* LOADING OVERLAY */}
        {(isRendering || isAnalyzing) && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
                <Sparkles className="h-12 w-12 text-indigo-500 animate-spin mb-6" />
                <h3 className="text-2xl font-bold text-white mb-2">
                    {isRendering ? 'Stitching Video...' : 'Analyzing with Gemini...'}
                </h3>
                <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                    <div 
                        className="h-full bg-indigo-500 transition-all duration-300 ease-out" 
                        style={{ width: `${isRendering ? renderProgress : 100}%` }} 
                    />
                </div>
                <p className="text-slate-400 text-sm animate-pulse">
                    {isRendering ? `${Math.round(renderProgress)}% complete` : 'Generating transcription & summary...'}
                </p>
            </div>
        )}

      </div>
    </div>
  );
};