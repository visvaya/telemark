import { generatedSetParts } from "./test-support/generated-hills";
import { describeGeneratedSetPart, GENERATED_SET_FILES } from "./test-support/hill-stability.cases";

describeGeneratedSetPart(generatedSetParts(GENERATED_SET_FILES)[1] ?? []);
