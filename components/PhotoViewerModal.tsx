import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Video } from 'expo-av';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import { buildUrl } from '@/lib/apiClient';

export type PhotoItem = {
  rootId: string;
  path: string;
  name?: string | null;
  mime?: string | null;
};

type PhotoViewerModalProps = {
  visible: boolean;
  items: PhotoItem[];
  activeIndex: number;
  onClose: () => void;
  authHeaders?: Record<string, string>;
};

function Zoomable({ children, resetKey }: { children: React.ReactNode; resetKey: string }) {
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const scale = Animated.multiply(baseScale, pinchScale);

  useEffect(() => {
    lastScale.current = 1;
    baseScale.setValue(1);
    pinchScale.setValue(1);
  }, [resetKey, baseScale, pinchScale]);

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], {
    useNativeDriver: true,
  });

  const onPinchStateChange = (event: { nativeEvent: { oldState: number; scale: number } }) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      let nextScale = lastScale.current * event.nativeEvent.scale;
      nextScale = Math.max(1, Math.min(4, nextScale));
      lastScale.current = nextScale;
      baseScale.setValue(nextScale);
      pinchScale.setValue(1);
    }
  };

  return (
    <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
      <Animated.View style={[styles.zoomWrap, { transform: [{ scale }] }]}>{children}</Animated.View>
    </PinchGestureHandler>
  );
}

export default function PhotoViewerModal({
  visible,
  items,
  activeIndex,
  onClose,
  authHeaders,
}: PhotoViewerModalProps) {
  const screen = Dimensions.get('window');
  const listRef = useRef<FlatList<PhotoItem>>(null);
  const safeIndex = useMemo(() => {
    if (!items.length) {
      return 0;
    }
    return Math.max(0, Math.min(items.length - 1, activeIndex));
  }, [items.length, activeIndex]);
  const [currentIndex, setCurrentIndex] = useState(safeIndex);

  useEffect(() => {
    setCurrentIndex(safeIndex);
  }, [safeIndex, visible]);

  useEffect(() => {
    if (!visible || !items.length) {
      return;
    }
    const handle = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
    });
    return () => cancelAnimationFrame(handle);
  }, [visible, safeIndex, items.length]);

  if (!visible) {
    return null;
  }

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="fade">
      <View style={styles.backdrop}>
        <Pressable style={styles.close} onPress={onClose}>
          <FontAwesome name="xmark" size={20} color="#fff" />
        </Pressable>
        <Text style={styles.counter}>
          {items.length ? `${currentIndex + 1} / ${items.length}` : ''}
        </Text>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => `${item.rootId}:${item.path}`}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={screen.width}
          snapToAlignment="center"
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={safeIndex}
          getItemLayout={(_, index) => ({
            length: screen.width,
            offset: screen.width * index,
            index,
          })}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screen.width);
            setCurrentIndex(Math.max(0, Math.min(items.length - 1, nextIndex)));
          }}
          onScrollToIndexFailed={(info) => {
            const offset = Math.min(info.index, items.length - 1) * screen.width;
            listRef.current?.scrollToOffset({ offset, animated: false });
          }}
          renderItem={({ item, index }) => (
            <View style={[styles.item, { width: screen.width }]}>
              <View style={styles.card}>
                {item.mime?.startsWith('video/') ? (
                  <Zoomable resetKey={`${item.rootId}:${item.path}`}>
                    <Video
                      source={{
                        uri: buildUrl('/api/file', { root: item.rootId, path: item.path }),
                        headers: authHeaders,
                      }}
                      posterSource={{
                        uri: buildUrl('/api/preview', { root: item.rootId, path: item.path }),
                        headers: authHeaders,
                      }}
                      usePoster
                      useNativeControls
                      resizeMode="contain"
                      shouldPlay={index === currentIndex}
                      style={[styles.video, { height: screen.height * 0.6 }]}
                    />
                  </Zoomable>
                ) : (
                  <Zoomable resetKey={`${item.rootId}:${item.path}`}>
                    <Image
                      source={{
                        uri: buildUrl('/api/preview', { root: item.rootId, path: item.path }),
                        headers: authHeaders,
                      }}
                      style={[styles.image, { height: screen.height * 0.6 }]}
                    />
                  </Zoomable>
                )}
                <Text style={styles.label} numberOfLines={1}>
                  {item.name || item.path}
                </Text>
              </View>
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0B0F14',
    padding: 24,
  },
  close: {
    alignSelf: 'flex-end',
    padding: 8,
    marginBottom: 8,
  },
  counter: {
    alignSelf: 'center',
    color: '#E6EAF0',
    fontSize: 12,
    marginBottom: 12,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
  },
  zoomWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    borderRadius: 12,
    resizeMode: 'contain',
  },
  video: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#000',
  },
  label: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#E6EAF0',
  },
});
