import { useState } from "react";
import { useWindowDimensions } from "react-native";
import { buildSpcCalendar } from "./spcCalendarModel";
import { BarsArea, WeekRow, Bar, ActionPill, CalendarCard, EmptyCalendar, ShowAllToggle, MoveWeekSheet, WIDE_AT } from "./spcCalendarParts";

// Native half of the SPC block calendar — see spcCalendarParts.js for the
// shapes and spcCalendarModel.js for what decides them.
//
// Moving a session here is long-press → pick a week, not the drag the web
// half has: dnd-kit is DOM-only, and a hand-rolled pan would have to measure
// row positions with onLayout, which is exactly the kind of thing that can't
// be verified from a browser. Coaches are on the installed PWA, which is the
// web build; this is the fallback path.
export function SpcBlockCalendar({
  block,
  workouts,
  completions,
  sessionsPerWeek,
  today,
  meta,
  onSelectSession,
  onMoveSession,
  showAll,
  onToggleShowAll,
}) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_AT;
  const [moving, setMoving] = useState(null);
  const calendar = buildSpcCalendar({
    block,
    workouts,
    completions,
    sessionsPerWeek,
    today,
    windowWeeks: showAll ? Infinity : 2,
  });
  const hidden = calendar.hiddenBefore + calendar.hiddenAfter;

  if (calendar.rows.length === 0) return <EmptyCalendar />;

  const renderBar = (bar) => (
    <Bar
      bar={bar}
      onPress={onSelectSession}
      action={
        bar.movable && onMoveSession ? (
          bar.state === "pastOpen" && calendar.todayWeek ? (
            <ActionPill label="Do this week" onPress={() => onMoveSession(bar, calendar.todayWeek)} />
          ) : (
            <ActionPill label="Move" onPress={() => setMoving(bar)} />
          )
        ) : null
      }
    />
  );

  return (
    <>
      <CalendarCard
        meta={meta}
        wide={wide}
        footer={hidden > 0 || showAll ? <ShowAllToggle showAll={showAll} length={calendar.length} onPress={onToggleShowAll} /> : null}
      >
        {calendar.rows.map((row, i) => (
          <WeekRow key={row.week} row={row} wide={wide} last={i === calendar.rows.length - 1}>
            <BarsArea row={row} onSelectSession={onSelectSession} renderBar={renderBar} />
          </WeekRow>
        ))}
      </CalendarCard>

      <MoveWeekSheet
        bar={moving}
        length={calendar.length}
        onClose={() => setMoving(null)}
        onPick={(week) => {
          const bar = moving;
          setMoving(null);
          onMoveSession?.(bar, week);
        }}
      />
    </>
  );
}
