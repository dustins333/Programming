import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWindowDimensions } from "react-native";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, pointerWithin } from "@dnd-kit/core";
import { buildSpcCalendar } from "./spcCalendarModel";
import { BarsArea, WeekRow, Bar, ActionPill, CalendarCard, EmptyCalendar, ShowAllToggle, WIDE_AT } from "./spcCalendarParts";

// Web half of the SPC block calendar. Same rows and the same five states as
// the native half (spcCalendarParts.js) — what differs is that a session is
// moved by dragging it vertically onto another week.
//
// Deliberately NOT importing ./SpcBlockCalendar: Metro applies platform
// extension resolution to plain imports too, so a `.web.js` importing its own
// sibling resolves back to itself and crash-loops. Everything shared lives in
// spcCalendarParts / spcCalendarModel, which have no `.web.js` siblings.
//
// The bars span the full width, so there is no horizontal target to hit —
// which is what makes this workable on a phone, where the old tile grid never
// was.

function DraggableBar({ bar, children }) {
  // The node is carried in `data` so onDragStart can measure the bar the drag
  // actually started from — that is what lets the preview keep the grab point.
  const nodeRef = useRef(null);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: bar.key, data: { bar, nodeRef } });
  const setRefs = (node) => {
    nodeRef.current = node;
    setNodeRef(node);
  };
  return (
    <div
      ref={setRefs}
      {...attributes}
      {...listeners}
      // `manipulation`, not `none`: with a hold-to-activate sensor the page
      // must still scroll when a finger starts on a bar, and this calendar is
      // mostly bars. dnd-kit takes over once the hold completes.
      style={{ touchAction: "manipulation", opacity: isDragging ? 0.35 : 1, outline: "none" }}
    >
      {children}
    </div>
  );
}

function DroppableWeek({ week, disabled, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `week-${week}`, disabled });
  return <div ref={setNodeRef}>{children(isOver && !disabled)}</div>;
}

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
  const [dragging, setDragging] = useState(null);
  // The drag preview is positioned from the pointer by hand rather than with
  // dnd-kit's <DragOverlay>. DragOverlay renders position:fixed but subtracts
  // the scroll offset of every scrollable ancestor it finds — and in this app
  // the page scroller is a nested RNW ScrollView, not the document (see
  // app/+html.js's body{overflow:hidden}). Measured: the overlay sat exactly
  // scrollTop above the pointer, so on a scrolled page the card flew off
  // upward while the drop target still followed the pointer correctly.
  // Writing straight to the node's transform also keeps a pointermove out of
  // React's render path.
  const previewRef = useRef(null);
  const grabRef = useRef({ left: 0, top: 0, width: 0, dy: 0 });
  // 220ms hold rather than a distance threshold: a bar is also a tap target
  // that opens the session, and on touch a distance-only sensor would start a
  // drag out of a scroll. Tolerance lets a scroll that begins on a bar cancel
  // the pending drag instead of fighting it.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 220, tolerance: 8 } }));

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

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (e) => {
      const el = previewRef.current;
      if (el) el.style.transform = `translate3d(${grabRef.current.left}px, ${e.clientY - grabRef.current.dy}px, 0)`;
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [dragging]);

  const handleDragStart = ({ active, activatorEvent }) => {
    const node = active.data.current?.nodeRef?.current;
    const rect = node?.getBoundingClientRect();
    if (rect) {
      grabRef.current = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        dy: (activatorEvent?.clientY ?? rect.top) - rect.top,
      };
    }
    setDragging(active.data.current?.bar ?? null);
  };

  const handleDragEnd = ({ active, over }) => {
    const bar = dragging;
    setDragging(null);
    if (!bar || !over) return;
    const week = Number(String(over.id).replace("week-", ""));
    if (!Number.isFinite(week) || week === bar.week) return;
    onMoveSession?.(bar, week);
  };

  const renderBar = (bar) => {
    const node = (
      <Bar
        bar={bar}
        onPress={onSelectSession}
        action={
          bar.state === "pastOpen" && bar.movable && calendar.todayWeek && onMoveSession ? (
            <ActionPill label="Do this week" onPress={() => onMoveSession(bar, calendar.todayWeek)} />
          ) : null
        }
      />
    );
    return bar.movable && onMoveSession ? <DraggableBar bar={bar}>{node}</DraggableBar> : node;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragCancel={() => setDragging(null)}
      onDragEnd={handleDragEnd}
    >
      <CalendarCard
        meta={meta}
        wide={wide}
        hint={onMoveSession ? "Hold a session and drag it onto another week to move it." : null}
        footer={hidden > 0 || showAll ? <ShowAllToggle showAll={showAll} length={calendar.length} onPress={onToggleShowAll} /> : null}
      >
        {calendar.rows.map((row, i) => (
          <DroppableWeek key={row.week} week={row.week} disabled={!dragging || dragging.week === row.week}>
            {(isOver) => (
              <WeekRow row={row} wide={wide} last={i === calendar.rows.length - 1} dropActive={isOver}>
                <BarsArea row={row} onSelectSession={onSelectSession} renderBar={renderBar} />
              </WeekRow>
            )}
          </DroppableWeek>
        ))}
      </CalendarCard>

      {/* Portalled to <body> so no scroll container can clip it — the same
          reason the builders' sidebars needed an overlay. */}
      {dragging
        ? createPortal(
            <div
              ref={previewRef}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: grabRef.current.width,
                pointerEvents: "none",
                zIndex: 9999,
                opacity: 0.95,
                transform: `translate3d(${grabRef.current.left}px, ${grabRef.current.top}px, 0)`,
              }}
            >
              <Bar bar={dragging} dragging />
            </div>,
            document.body
          )
        : null}
    </DndContext>
  );
}
