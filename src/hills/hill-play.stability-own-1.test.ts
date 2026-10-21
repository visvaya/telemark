import { shardOf } from "../test-support/shards";
import { OWN_HILL_SPECS } from "./own-hills";
import { describeOwnHillStability, OWN_HILL_STABILITY_FILES } from "./test-support/hill-stability.cases";

describeOwnHillStability(shardOf(OWN_HILL_SPECS, 0, OWN_HILL_STABILITY_FILES));
