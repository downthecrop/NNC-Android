import TrackPlayer, { Event } from 'react-native-track-player';

export default async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play().catch(() => {});
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause().catch(() => {});
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop().catch(() => {});
  });
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    TrackPlayer.skipToNext().then(() => TrackPlayer.play()).catch(() => {});
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    TrackPlayer.skipToPrevious().then(() => TrackPlayer.play()).catch(() => {});
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    const position = Number.isFinite(event.position) ? event.position : 0;
    TrackPlayer.seekTo(position).catch(() => {});
  });
}
