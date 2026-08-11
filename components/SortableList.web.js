import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Web half of the shared reorderable list — see SortableList.js for the
// native ▲/▼ fallback and the shared API contract.
//
// Mirrors the interaction model already proven in the workout builders
// (app/(coach)/builder/[workoutId].web.js): a 4px activation distance so a
// row stays clickable, pointerWithin collision detection, and a *separate*
// small drag handle rather than making the whole row draggable — rows here
// carry their own checkbox/edit/delete Pressables that must keep working.

function SortableRow({ id, item, index, renderItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const controls = (
    <div
      {...attributes}
      {...listeners}
      style={{ cursor: "grab", padding: 4, color: "#78716c", userSelect: "none", touchAction: "none" }}
      aria-label="Drag to reorder"
    >
      ⠿
    </div>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {renderItem(item, controls, index)}
    </div>
  );
}

export function SortableList({ items, onReorder, renderItem, keyExtractor = (item) => item.id }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = items.map(keyExtractor);

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableRow key={keyExtractor(item)} id={keyExtractor(item)} item={item} index={i} renderItem={renderItem} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
