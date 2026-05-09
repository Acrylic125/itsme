import { ListBulletIcon, TextIcon } from "@radix-ui/react-icons";
import { FavIcon } from "./icon/favicon";
import { Button } from "./ui/button";

export function PageCanvasToolbar(props: {
  onToggleAddText: () => void;
  onToggleAddList: () => void;
}) {
  const { onToggleAddText, onToggleAddList } = props;
  return (
    <div className="w-full flex flex-row justify-between items-center sticky top-0 z-10 bg-background border-b p-2">
      <div className="flex-1 flex flex-row gap-1.5 items-center px-2">
        <div className="size-6">
          <FavIcon />
        </div>
        <p className="font-extrabold">ITSME</p>
      </div>
      <div className="flex-1 flex flex-row gap-2 items-center justify-center">
        <Button variant="outline" type="button" onClick={onToggleAddText}>
          <div className="flex flex-row items-center gap-2">
            <TextIcon />
            <span>Text</span>
          </div>
        </Button>
        <Button variant="outline" type="button" onClick={onToggleAddList}>
          <div className="flex flex-row items-center gap-2">
            <ListBulletIcon />
            <span>List</span>
          </div>
        </Button>
      </div>
      <div className="flex-1 flex flex-row gap-1 justify-end">
        <Button variant="outline">Refine</Button>
        <Button>Download</Button>
      </div>
    </div>
  );
}
