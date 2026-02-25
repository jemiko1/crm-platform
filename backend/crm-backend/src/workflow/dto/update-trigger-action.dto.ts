import { PartialType } from "@nestjs/mapped-types";
import { CreateTriggerActionDto } from "./create-trigger-action.dto";

export class UpdateTriggerActionDto extends PartialType(CreateTriggerActionDto) {}
