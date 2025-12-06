import React, { useState, useEffect, useRef } from 'react';
import { Group, Vlog, User } from './types';
import { Recorder } from './components/Recorder';
import { Button } from './components/Button';
import { INITIAL_GROUP, CURRENT_USER_ID } from './services/mockData';
import { 
  Video, 
  Users, 
  Clock, 
  MessageSquare, 
  Play, 
  Calendar,
  Sparkles,
  Lock,
  ChevronRight,
  Mic,
  Check,
  Settings,
  X,
  Camera,
  Upload,
  AlarmClock,
  ArrowRight,
  Plus,
  Hash,
  Heart, 
  ThumbsUp, 
  Laugh, 
  Hand, 
  MessageCircle,
  Timer
} from 'lucide-react';

// A simple Hash Router implementation
const HashRouter = ({ children }: { children?: React.ReactNode }) => {
  const [route, setRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return <>{children}</>;
};

// --- Helpers ---
const getNextOccurrence = (timeStr: string, forceTomorrow: boolean = false) => {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  let target = new Date();
  target.setHours(h, m, 0, 0);
  
  if (forceTomorrow || now > target) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
};

const CountdownTimer = ({ targetDate, label, onComplete }: { targetDate: number, label: string, onComplete?: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, targetDate - Date.now()));

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = Math.max(0, targetDate - Date.now());
      setTimeLeft(newTimeLeft);
      if (newTimeLeft === 0) {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate, onComplete]);

  if (timeLeft <= 0) return null;

  const hours = Math.floor((timeLeft / (1000 * 60 * 60)));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  return (
    <div className="flex flex-col items-center animate-in fade-in">
       <span className="text-[10px] text-indigo-300/80 uppercase tracking-widest font-semibold mb-1">{label}</span>
       <div className="font-mono text-3xl font-bold text-white flex items-baseline gap-1 tabular-nums tracking-tight">
          <span>{String(hours).padStart(2, '0')}</span>
          <span className="text-indigo-400 text-xl">:</span>
          <span>{String(minutes).padStart(2, '0')}</span>
          <span className="text-indigo-400 text-xl">:</span>
          <span>{String(seconds).padStart(2, '0')}</span>
       </div>
    </div>
  );
};

// --- Members List Modal ---
const MembersListModal = ({ 
  members, 
  currentVoD, 
  currentUser,
  onClose 
}: { 
  members: User[], 
  currentVoD: string, 
  currentUser: User,
  onClose: () => void 
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            Members ({members.length})
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="overflow-y-auto p-2">
          {members.map(member => (
            <div key={member.id} className="flex items-center gap-4 p-3 hover:bg-slate-800/50 rounded-xl transition-colors">
              <img src={member.avatar} alt={member.name} className="h-12 w-12 rounded-full object-cover border border-slate-700" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200">{member.name}</span>
                  {member.id === currentUser.id && (
                    <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">You</span>
                  )}
                </div>
                {member.id === currentVoD ? (
                   <span className="text-xs text-indigo-400 flex items-center gap-1 mt-0.5">
                     <Sparkles className="h-3 w-3" /> Vlogger of the Day
                   </span>
                ) : (
                   <span className="text-xs text-slate-500">Member</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Settings Modal ---
const SettingsModal = ({ 
  group, 
  currentUser, 
  onClose, 
  onSave 
}: { 
  group: Group, 
  currentUser: User, 
  onClose: () => void, 
  onSave: (groupName: string, groupAvatar: string, userName: string, userAvatar: string, publishTime: string, recordingStartTime: string) => void 
}) => {
  const [groupName, setGroupName] = useState(group.name);
  const [groupAvatar, setGroupAvatar] = useState(group.avatar || `https://ui-avatars.com/api/?name=${group.name}&background=random`);
  
  const [userName, setUserName] = useState(currentUser.name);
  const [userAvatar, setUserAvatar] = useState(currentUser.avatar);

  const [publishTime, setPublishTime] = useState(group.publishTime || "09:00");
  const [recordingStartTime, setRecordingStartTime] = useState(group.recordingStartTime || "08:00");

  const groupFileRef = useRef<HTMLInputElement>(null);
  const userFileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setUrl: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(groupName, groupAvatar, userName, userAvatar, publishTime, recordingStartTime);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-400" />
            Settings
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-8 overflow-y-auto">
          {/* Group Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Users className="h-3 w-3" /> Group Profile
            </h3>
            
            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 flex justify-between items-center">
               <span className="text-sm text-slate-400">Invite Code</span>
               <span className="font-mono text-lg font-bold text-indigo-400 tracking-widest">{group.inviteCode}</span>
            </div>

            <div className="flex items-center gap-4">
               <div className="relative group cursor-pointer" onClick={() => groupFileRef.current?.click()}>
                 <img 
                    src={groupAvatar} 
                    alt="Group" 
                    className="h-20 w-20 rounded-2xl object-cover border-2 border-slate-700 shadow-md transition-opacity group-hover:opacity-75" 
                 />
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/50 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="h-4 w-4 text-white" />
                    </div>
                 </div>
                 <input 
                   type="file" 
                   ref={groupFileRef} 
                   className="hidden" 
                   accept="image/*"
                   onChange={(e) => handleFileChange(e, setGroupAvatar)}
                 />
               </div>
               
               <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-300 mb-1">Group Name</label>
                  <input 
                    type="text" 
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="e.g. Besties 📸"
                  />
                  <button 
                    type="button" 
                    onClick={() => groupFileRef.current?.click()}
                    className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                  >
                    <Upload className="h-3 w-3" /> Upload Group Icon
                  </button>
               </div>
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* Schedule Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <AlarmClock className="h-3 w-3" /> Daily Schedule
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Recording Starts</label>
                <div className="relative">
                  <input 
                    type="time" 
                    value={recordingStartTime}
                    onChange={(e) => setRecordingStartTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all [color-scheme:dark]"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Users have 18h to record.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Publish Time</label>
                <div className="relative">
                  <input 
                    type="time" 
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all [color-scheme:dark]"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Next day premiere.</p>
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* User Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
               <Video className="h-3 w-3" /> Your Profile
            </h3>
            
            <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => userFileRef.current?.click()}>
                <img 
                   src={userAvatar} 
                   alt="Preview" 
                   className="h-20 w-20 rounded-full object-cover border-2 border-slate-700 shadow-md transition-opacity group-hover:opacity-75" 
                />
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="bg-black/50 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                     <Camera className="h-4 w-4 text-white" />
                   </div>
                </div>
                <input 
                   type="file" 
                   ref={userFileRef} 
                   className="hidden" 
                   accept="image/*"
                   onChange={(e) => handleFileChange(e, setUserAvatar)}
                 />
              </div>
              <div className="flex-1">
                 <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
                 <input 
                   type="text" 
                   value={userName}
                   onChange={(e) => setUserName(e.target.value)}
                   className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                   placeholder="Your Name"
                 />
                 <button 
                    type="button" 
                    onClick={() => userFileRef.current?.click()}
                    className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                  >
                    <Upload className="h-3 w-3" /> Upload Profile Picture
                  </button>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button type="submit" className="w-full py-3">Save Changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Dashboard Component ---
const Dashboard = ({ 
  group, 
  onStartRecording, 
  onViewVlog,
  onOpenSettings,
  onOpenMembers
}: { 
  group: Group, 
  onStartRecording: () => void, 
  onViewVlog: (vlog: Vlog) => void,
  onOpenSettings: () => void,
  onOpenMembers: () => void
}) => {
  const isVoD = group.currentVoD === CURRENT_USER_ID;
  const vodUser = group.members.find(m => m.id === group.currentVoD);
  const [now, setNow] = useState(Date.now());

  // Force re-render for countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000); // Check minute updates
    return () => clearInterval(timer);
  }, []);
  
  // A vlog is "pending" if it exists but its availableAt time is in the future
  const pendingVlog = group.vlogs.find(v => v.availableAt > now);
  const visibleVlogs = group.vlogs.filter(v => v.availableAt <= now).slice().reverse();
  
  const nextSelectionTime = getNextOccurrence(group.recordingStartTime || "08:00");

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-950 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <header className="p-6 flex justify-between items-center bg-slate-800/50 backdrop-blur-sm sticky top-0 z-10 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          {group.avatar && (
            <img src={group.avatar} alt={group.name} className="h-10 w-10 rounded-xl object-cover border border-slate-700" />
          )}
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              {group.name}
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-1">
               <Hash className="h-3 w-3" /> {group.inviteCode} • {group.members.length} members
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onOpenMembers} className="flex -space-x-2 hover:opacity-80 transition-opacity">
            {group.members.slice(0,3).map(m => (
              <img key={m.id} src={m.avatar} alt={m.name} className="h-8 w-8 rounded-full border-2 border-slate-900 object-cover" />
            ))}
             {group.members.length > 3 && (
                <div className="h-8 w-8 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[10px] text-white">
                    +{group.members.length - 3}
                </div>
             )}
          </button>
          <button 
            onClick={onOpenSettings}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="p-6 space-y-8">
        
        {/* Next Selection Countdown (Small) */}
        {!pendingVlog && (
            <div className="flex justify-between items-center bg-slate-900/50 border border-slate-800 rounded-xl p-3 px-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                    <Timer className="h-4 w-4 text-indigo-500" />
                    Next Vlogger Selection
                </div>
                <div className="text-xs font-mono text-white">
                    {/* Inline countdown logic simplified for small display */}
                    {(() => {
                        const diff = Math.max(0, nextSelectionTime - now);
                        const h = Math.floor(diff / (1000 * 60 * 60));
                        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        return `${h}h ${m}m`;
                    })()}
                </div>
            </div>
        )}

        {/* Status Card */}
        <div className="bg-gradient-to-br from-indigo-900/50 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Video className="h-32 w-32 text-indigo-400" />
          </div>
          
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold mb-4 border border-indigo-500/20">
              VLOGGER OF THE DAY
            </span>
            
            <div className="flex items-center gap-4 mb-6">
               <div className="relative">
                 <img src={vodUser?.avatar} className="h-16 w-16 rounded-full border-4 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.5)] object-cover" />
                 {isVoD && <div className="absolute -bottom-1 -right-1 bg-indigo-500 text-white rounded-full p-1"><Sparkles size={12} fill="currentColor"/></div>}
               </div>
               <div>
                 <h2 className="text-2xl font-bold text-white leading-none">{vodUser?.name}</h2>
                 <p className="text-indigo-200/70 text-sm mt-1">
                    {isVoD ? "It's your turn to shine! ✨" : "is recording today's story."}
                 </p>
               </div>
            </div>

            {/* ACTION AREA */}
            {isVoD && !pendingVlog ? (
              <Button onClick={onStartRecording} className="w-full py-4 text-lg font-semibold shadow-indigo-900/20" variant="primary">
                 <div className="flex items-center justify-center gap-2">
                   <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                   Record Daily Vlog
                 </div>
              </Button>
            ) : pendingVlog ? (
               <div className="bg-slate-950/60 rounded-2xl p-5 border border-slate-700/50 flex flex-col items-center text-center">
                  <div className="mb-3 text-emerald-400 flex items-center gap-2 font-medium">
                    <Check className="h-5 w-5" /> Vlog Recorded
                  </div>
                  <CountdownTimer targetDate={pendingVlog.availableAt} label="Premieres In" />
                  <p className="text-xs text-slate-500 mt-3">
                    Scheduled for {new Date(pendingVlog.availableAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} tomorrow
                  </p>
               </div>
            ) : (
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
                 <p className="text-sm text-slate-400 flex items-center gap-2">
                   <Clock className="h-4 w-4" />
                   Waiting for {vodUser?.name} to upload...
                 </p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Archive */}
        <div>
          <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-slate-500" />
            Past Vlogs
          </h3>
          <div className="space-y-4">
            {visibleVlogs.length === 0 ? (
                <div className="text-center py-10 text-slate-600 border border-dashed border-slate-800 rounded-2xl">
                    <Video className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No vlogs yet. Start recording!</p>
                </div>
            ) : (
                visibleVlogs.map(vlog => (
                  <div 
                    key={vlog.id} 
                    className="bg-slate-800/40 border border-slate-800 hover:border-slate-700 transition-colors rounded-2xl overflow-hidden group"
                  >
                    {/* Content Section */}
                    <div onClick={() => onViewVlog(vlog)} className="p-3 flex gap-4 cursor-pointer">
                        <div className="relative h-20 w-20 flex-shrink-0 bg-slate-700 rounded-xl overflow-hidden">
                        <img src={vlog.thumbnailUrl} className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-black/30 p-1.5 rounded-full backdrop-blur-sm">
                            <Play className="h-4 w-4 text-white fill-current" />
                            </div>
                        </div>
                        </div>
                        <div className="flex-1 min-w-0 py-1">
                        <div className="flex justify-between items-start">
                            <h4 className="font-medium text-slate-200 truncate pr-2">{vlog.title}</h4>
                            <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Calendar className="h-2.5 w-2.5" />
                                {new Date(vlog.recordedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                <span className="text-slate-700">|</span>
                                {new Date(vlog.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                            {vlog.aiSummary || vlog.transcription}
                        </p>
                        </div>
                    </div>

                    {/* Interaction Footer */}
                    <div className="px-3 pb-3 pt-1 flex items-center justify-between border-t border-slate-800/50 mt-1">
                        <div className="flex gap-2">
                            {/* Reactions Mock - Using local state effect via active class for demo visual */}
                            <button className="p-1.5 rounded-full text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 transition-colors" title="Like">
                                <Heart className="h-4 w-4" />
                            </button>
                            <button className="p-1.5 rounded-full text-slate-500 hover:text-amber-500 hover:bg-amber-500/10 transition-colors" title="Clap">
                                <Hand className="h-4 w-4" />
                            </button>
                            <button className="p-1.5 rounded-full text-slate-500 hover:text-sky-500 hover:bg-sky-500/10 transition-colors" title="Laugh">
                                <Laugh className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>{vlog.comments.length}</span>
                        </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const VlogPlayer = ({ vlog, onClose }: { vlog: Vlog, onClose: () => void }) => {
  const [showTranscript, setShowTranscript] = useState(false);
  
  return (
    <div className="fixed inset-0 bg-black z-40 flex flex-col animate-in slide-in-from-bottom-10 duration-200">
      {/* Video Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center">
        <video 
          src={vlog.videoUrl || "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"} 
          className="w-full h-full object-contain"
          controls
          autoPlay
        />
        
        {/* Overlay Controls */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent">
          <button onClick={onClose} className="text-white hover:text-gray-300 flex items-center gap-1 text-sm font-medium">
             <ChevronRight className="rotate-180 h-5 w-5" /> Back
          </button>
        </div>
      </div>

      {/* Details & Chat Panel */}
      <div className="h-1/2 bg-slate-900 border-t border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <div className="flex justify-between items-start mb-2">
             <h2 className="text-lg font-bold text-white">{vlog.title}</h2>
             <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(vlog.recordedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
             </span>
          </div>
          
          <div className="flex gap-2 mb-3">
             <button 
               onClick={() => setShowTranscript(false)}
               className={`px-3 py-1 text-xs rounded-full border transition-colors ${!showTranscript ? 'bg-white text-black border-white' : 'bg-transparent text-slate-400 border-slate-700'}`}
             >
               Comments ({vlog.comments.length})
             </button>
             <button 
               onClick={() => setShowTranscript(true)}
               className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1 ${showTranscript ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-transparent text-slate-400 border-slate-700'}`}
             >
               <Sparkles className="h-3 w-3" /> AI Analysis
             </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
           {showTranscript ? (
             <div className="space-y-4 animate-in fade-in duration-300">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                   <h4 className="text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">AI Summary</h4>
                   <p className="text-sm text-slate-300 leading-relaxed">{vlog.aiSummary}</p>
                </div>
                <div>
                   <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Full Transcription</h4>
                   <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">
                     {vlog.transcription}
                   </p>
                </div>
             </div>
           ) : (
             <div className="space-y-4">
               {vlog.comments.length === 0 ? (
                 <div className="text-center text-slate-500 py-10">
                   <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                   <p className="text-sm">No comments yet. Be the first!</p>
                 </div>
               ) : (
                 vlog.comments.map(c => (
                   <div key={c.id} className="flex gap-3">
                     <div className="h-8 w-8 rounded-full bg-slate-700 flex-shrink-0" />
                     <div>
                       <div className="flex items-baseline gap-2">
                         <span className="text-sm font-medium text-slate-300">User</span>
                         <span className="text-[10px] text-slate-600">2h ago</span>
                       </div>
                       <p className="text-sm text-slate-400">{c.text}</p>
                     </div>
                   </div>
                 ))
               )}
             </div>
           )}
        </div>

        {/* Input Area */}
        {!showTranscript && (
          <div className="p-3 bg-slate-800 flex gap-2">
             <input 
               type="text" 
               placeholder="Add a comment..."
               className="flex-1 bg-slate-900 border border-slate-700 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
             />
             <Button size="sm" className="rounded-full px-4">Post</Button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Onboarding Flow Components ---
const OnboardingLayout = ({ children, title, subtitle }: { children?: React.ReactNode, title: string, subtitle: string }) => (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
        <div className="w-full max-w-sm text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
                {title}
            </h1>
            <p className="text-slate-400">{subtitle}</p>
        </div>
        <div className="w-full max-w-sm bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl">
            {children}
        </div>
    </div>
);

export default function App() {
  const [onboardingStep, setOnboardingStep] = useState<'profile' | 'choice' | 'create' | 'join' | 'complete'>('profile');
  const [tempUser, setTempUser] = useState({ name: '', avatar: '' });
  const [tempGroup, setTempGroup] = useState({ name: '', avatar: '', code: '' });
  
  const [group, setGroup] = useState<Group | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMembersListOpen, setIsMembersListOpen] = useState(false);
  const [viewingVlog, setViewingVlog] = useState<Vlog | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProfileSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if(tempUser.name.trim()) setOnboardingStep('choice');
  };

  const generateGroupCode = () => Math.floor(100000 + Math.random() * 900000).toString();

  const handleCreateGroup = (e: React.FormEvent) => {
      e.preventDefault();
      if(!tempGroup.name.trim()) return;

      const code = generateGroupCode();
      const newGroup: Group = {
          id: `g-${Date.now()}`,
          name: tempGroup.name,
          avatar: tempGroup.avatar || `https://ui-avatars.com/api/?name=${tempGroup.name}&background=random`,
          inviteCode: code,
          members: [{
              id: CURRENT_USER_ID,
              name: tempUser.name,
              avatar: tempUser.avatar || `https://ui-avatars.com/api/?name=${tempUser.name}&background=random`,
              isCurrentUser: true
          }],
          currentVoD: CURRENT_USER_ID,
          vlogs: [],
          publishTime: "09:00",
          recordingStartTime: "08:00"
      };

      setGroup(newGroup);
      setOnboardingStep('complete');
  };

  const handleJoinGroup = (e: React.FormEvent) => {
      e.preventDefault();
      // For mock purposes, we just join the existing Mock Group but update current user details
      const joinedGroup: Group = {
          ...INITIAL_GROUP,
          members: INITIAL_GROUP.members.map(m => m.id === CURRENT_USER_ID ? {
              ...m,
              name: tempUser.name,
              avatar: tempUser.avatar || `https://ui-avatars.com/api/?name=${tempUser.name}&background=random`
          } : m)
      };
      setGroup(joinedGroup);
      setOnboardingStep('complete');
  };

  const handleRecordingComplete = (file: Blob, metadata: { title: string; transcription: string; summary: string }) => {
    if (!group) return;
    const fileUrl = URL.createObjectURL(file);
    
    // Calculate Premiere Time (Next day at publishTime)
    const premiereTime = getNextOccurrence(group.publishTime || "09:00", true);

    const newVlog: Vlog = {
      id: `v-${Date.now()}`,
      userId: CURRENT_USER_ID,
      videoUrl: fileUrl,
      thumbnailUrl: 'https://picsum.photos/400/600',
      duration: 120,
      recordedAt: Date.now(),
      availableAt: premiereTime, // Set to future
      title: metadata.title,
      transcription: metadata.transcription,
      aiSummary: metadata.summary,
      comments: [],
      views: 0
    };

    setGroup(prev => prev ? ({
      ...prev,
      vlogs: [...prev.vlogs, newVlog]
    }) : null);
    setIsRecording(false);
    // Do NOT auto-view vlog, as it is locked
  };

  const handleSettingsSave = (groupName: string, groupAvatar: string, userName: string, userAvatar: string, publishTime: string, recordingStartTime: string) => {
    setGroup(prev => prev ? ({
      ...prev,
      name: groupName,
      avatar: groupAvatar,
      publishTime,
      recordingStartTime,
      members: prev.members.map(m => 
        m.id === CURRENT_USER_ID 
          ? { ...m, name: userName, avatar: userAvatar } 
          : m
      )
    }) : null);
  };

  // --- RENDERING ---

  if (onboardingStep === 'profile') {
      return (
          <OnboardingLayout title="Welcome" subtitle="Let's set up your profile first.">
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                  <div className="flex flex-col items-center gap-4">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="h-24 w-24 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors overflow-hidden"
                      >
                          {tempUser.avatar ? (
                              <img src={tempUser.avatar} className="h-full w-full object-cover" />
                          ) : (
                              <Camera className="h-8 w-8 text-slate-500" />
                          )}
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if(file) {
                                    const reader = new FileReader();
                                    reader.onload = () => setTempUser(prev => ({ ...prev, avatar: reader.result as string }));
                                    reader.readAsDataURL(file);
                                }
                            }}
                          />
                      </div>
                      <p className="text-xs text-slate-500">Tap to upload photo</p>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                      <input 
                        type="text" 
                        required
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="e.g. Alex"
                        value={tempUser.name}
                        onChange={e => setTempUser(prev => ({...prev, name: e.target.value}))}
                      />
                  </div>
                  <Button type="submit" className="w-full py-3">Confirm Profile <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </form>
          </OnboardingLayout>
      );
  }

  if (onboardingStep === 'choice') {
      return (
          <OnboardingLayout title="Get Started" subtitle="Create a new circle or join friends.">
              <div className="space-y-4">
                  <button 
                    onClick={() => setOnboardingStep('create')}
                    className="w-full p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-between transition-colors group"
                  >
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-500 rounded-lg"><Plus className="h-5 w-5" /></div>
                          <span className="font-semibold">Create a Group</span>
                      </div>
                      <ChevronRight className="h-5 w-5 opacity-50 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button 
                    onClick={() => setOnboardingStep('join')}
                    className="w-full p-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl flex items-center justify-between transition-colors group border border-slate-700"
                  >
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-700 rounded-lg"><Users className="h-5 w-5" /></div>
                          <span className="font-semibold">Join a Group</span>
                      </div>
                      <ChevronRight className="h-5 w-5 opacity-50 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button onClick={() => setOnboardingStep('profile')} className="w-full text-center text-slate-500 text-sm hover:text-slate-400 mt-4">
                      Back to Profile
                  </button>
              </div>
          </OnboardingLayout>
      );
  }

  if (onboardingStep === 'create') {
      return (
        <OnboardingLayout title="Create Group" subtitle="Name your new vlog squad.">
            <form onSubmit={handleCreateGroup} className="space-y-6">
                <div className="flex flex-col items-center gap-4">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="h-24 w-24 rounded-2xl bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors overflow-hidden"
                      >
                          {tempGroup.avatar ? (
                              <img src={tempGroup.avatar} className="h-full w-full object-cover" />
                          ) : (
                              <Users className="h-8 w-8 text-slate-500" />
                          )}
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if(file) {
                                    const reader = new FileReader();
                                    reader.onload = () => setTempGroup(prev => ({ ...prev, avatar: reader.result as string }));
                                    reader.readAsDataURL(file);
                                }
                            }}
                          />
                      </div>
                      <p className="text-xs text-slate-500">Group Icon (Optional)</p>
                  </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Group Name</label>
                    <input 
                      type="text" 
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="e.g. The Cool Kids"
                      value={tempGroup.name}
                      onChange={e => setTempGroup(prev => ({...prev, name: e.target.value}))}
                    />
                </div>
                <Button type="submit" className="w-full py-3">Create & Enter</Button>
                <button type="button" onClick={() => setOnboardingStep('choice')} className="w-full text-center text-slate-500 text-sm hover:text-slate-400">
                    Cancel
                </button>
            </form>
        </OnboardingLayout>
      );
  }

  if (onboardingStep === 'join') {
      return (
        <OnboardingLayout title="Join Group" subtitle="Enter the invite code from your friend.">
            <form onSubmit={handleJoinGroup} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">6-Digit Code</label>
                    <input 
                      type="text" 
                      required
                      maxLength={6}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="000000"
                      value={tempGroup.code}
                      onChange={e => setTempGroup(prev => ({...prev, code: e.target.value}))}
                    />
                </div>
                <Button type="submit" className="w-full py-3">Join Group</Button>
                <button type="button" onClick={() => setOnboardingStep('choice')} className="w-full text-center text-slate-500 text-sm hover:text-slate-400">
                    Cancel
                </button>
            </form>
        </OnboardingLayout>
      );
  }

  // --- DASHBOARD ---

  const currentUser = group?.members.find(m => m.id === CURRENT_USER_ID);

  return (
    <HashRouter>
      <div className="bg-slate-950 min-h-screen text-slate-50">
        {group && (
            <Dashboard 
              group={group} 
              onStartRecording={() => setIsRecording(true)} 
              onViewVlog={setViewingVlog}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenMembers={() => setIsMembersListOpen(true)}
            />
        )}
        
        {isRecording && (
          <Recorder 
            onComplete={handleRecordingComplete}
            onCancel={() => setIsRecording(false)}
          />
        )}

        {viewingVlog && (
          <VlogPlayer 
            vlog={viewingVlog} 
            onClose={() => setViewingVlog(null)} 
          />
        )}

        {isSettingsOpen && group && currentUser && (
          <SettingsModal 
            group={group}
            currentUser={currentUser}
            onClose={() => setIsSettingsOpen(false)}
            onSave={handleSettingsSave}
          />
        )}

        {isMembersListOpen && group && currentUser && (
          <MembersListModal 
            members={group.members}
            currentVoD={group.currentVoD}
            currentUser={currentUser}
            onClose={() => setIsMembersListOpen(false)}
          />
        )}
      </div>
    </HashRouter>
  );
}