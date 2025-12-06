import { Group, User, Vlog } from '../types';

export const CURRENT_USER_ID = 'u1';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Alex (You)', avatar: 'https://picsum.photos/seed/u1/100/100', isCurrentUser: true },
  { id: 'u2', name: 'Sarah', avatar: 'https://picsum.photos/seed/u2/100/100', isCurrentUser: false },
  { id: 'u3', name: 'Jordan', avatar: 'https://picsum.photos/seed/u3/100/100', isCurrentUser: false },
  { id: 'u4', name: 'Mike', avatar: 'https://picsum.photos/seed/u4/100/100', isCurrentUser: false },
];

export const INITIAL_GROUP: Group = {
  id: 'g1',
  name: 'Besties 📸',
  avatar: 'https://picsum.photos/seed/group_fun/200/200',
  inviteCode: '123456',
  members: MOCK_USERS,
  currentVoD: 'u1', // Default to current user for demo purposes initially
  vlogs: [
    {
      id: 'v-old-1',
      userId: 'u2',
      videoUrl: '', // Mocked
      thumbnailUrl: 'https://picsum.photos/seed/vold1/400/600',
      duration: 45,
      recordedAt: Date.now() - 86400000 * 2,
      availableAt: Date.now() - 86400000 * 2,
      title: "Coffee Run Madness",
      transcription: "Just went to get coffee and saw a dog wearing sunglasses.",
      comments: [],
      views: 12
    },
    {
      id: 'v-old-2',
      userId: 'u3',
      videoUrl: '', // Mocked
      thumbnailUrl: 'https://picsum.photos/seed/vold2/400/600',
      duration: 62,
      recordedAt: Date.now() - 86400000,
      availableAt: Date.now() - 86400000,
      title: "Gym Update",
      transcription: "Leg day is the worst day. Send help.",
      comments: [],
      views: 8
    }
  ],
  publishTime: "09:00",
  recordingStartTime: "08:00"
};

// Simple pseudo-random selector based on day of year to ensure consistency across refreshes for a "day"
export const selectDailyVlogger = (members: User[]): string => {
  const today = new Date().toDateString();
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = today.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % members.length;
  // For demo: Let's force it to be the current user mostly so they can test features
  // Uncomment below for real random:
  // return members[index].id;
  
  return CURRENT_USER_ID; 
};