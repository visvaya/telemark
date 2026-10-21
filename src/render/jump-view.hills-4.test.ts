import { OWN_HILLS } from "../game/hill-choice";
import { shardOf } from "../test-support/shards";
import { describeJumpViewOnHills, JUMP_VIEW_HILL_FILES } from "./test-support/jump-view-hills.cases";

describeJumpViewOnHills(shardOf(OWN_HILLS, 3, JUMP_VIEW_HILL_FILES));
