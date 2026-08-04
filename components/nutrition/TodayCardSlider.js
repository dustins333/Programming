import { useState } from "react";
import { View, ScrollView } from "react-native";
import { colors } from "../../lib/theme";

const MIN_HEIGHT = 120;

// Swipeable carousel for the nutrition Today tab's "Focus / Notes /
// Milestone" cards — replaces what used to be one stacked box. Each slide
// is full-width; the ScrollView's own height tracks the tallest slide
// measured so far (a plain horizontal ScrollView collapses to 0 height on
// its own otherwise) so switching slides never clips content or needs an
// internal scroll, matching the "no static scroll box" rule the Focus/Notes
// cards themselves follow.
export function TodayCardSlider({ slides }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [slideHeights, setSlideHeights] = useState({});

  if (slides.length === 0) return null;

  const maxHeight = Math.max(MIN_HEIGHT, ...Object.values(slideHeights));

  return (
    <View className="mb-5" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ height: maxHeight }}
        onScroll={(e) => {
          if (!width) return;
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) setIndex(i);
        }}
        scrollEventThrottle={32}
      >
        {slides.map((slide) => (
          <View
            key={slide.key}
            style={{ width }}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              setSlideHeights((prev) => (prev[slide.key] === h ? prev : { ...prev, [slide.key]: h }));
            }}
          >
            {slide.content}
          </View>
        ))}
      </ScrollView>
      {slides.length > 1 ? (
        <View className="mt-2 flex-row items-center justify-center gap-1.5">
          {slides.map((slide, i) => (
            <View
              key={slide.key}
              style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.primary : "#e7e5e4" }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
