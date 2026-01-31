import TrackPlayer from 'react-native-track-player';

TrackPlayer.registerPlaybackService(() => require('./lib/playbackService').default);

require('expo-router/entry');
