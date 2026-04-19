import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export type AgentPresenceState = 'registered' | 'unregistered';

export class ReportPresenceDto {
  /** SIP registration state as observed by the softphone's Registerer. */
  @IsEnum(['registered', 'unregistered'])
  state!: AgentPresenceState;

  /** The extension number the softphone is registered as (e.g. "1001"). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  extension!: string;

  /** Softphone-side timestamp of the observation (ISO8601). */
  @IsDateString()
  ts!: string;

  /** Optional error message from the last register attempt, if any. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lastError?: string;
}
