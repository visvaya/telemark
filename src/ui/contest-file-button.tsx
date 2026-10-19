import { useState } from "react";
import type { SavedContest } from "../game/contest-save";
import { contestFileName, contestFileText } from "../storage/contest-file";
import { UI_TEXT } from "../text/ui-text";
import { handOverFile } from "./hand-over-file";
import { TOUCH_QUERY, useMediaQuery } from "./use-media-query";

const T = UI_TEXT.competition;

/**
 * Gives the player the competition as a file, to go on with on another device: through the share sheet on a
 * phone, as a download on a computer; what became of it is said under the button.
 */
export function ContestFileButton({ contest }: { contest: SavedContest }) {
  const preferShare = useMediaQuery(TOUCH_QUERY);
  const [said, setSaid] = useState("");
  const save = async () => {
    const now = new Date();
    const file = new File([contestFileText(contest, now)], contestFileName(now), { type: "application/json" });
    setSaid(T.fileSaved[await handOverFile(file, T.fileTitle, preferShare)]);
  };
  return (
    <>
      <button type="button" className="pixel-button" onClick={() => void save()}>
        {T.saveToFile}
      </button>
      <p className="note" role="status">
        {said}
      </p>
    </>
  );
}
