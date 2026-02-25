import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function paginate(page = 1, pageSize = 20): { skip: number; take: number } {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  return { skip: (safePage - 1) * safeSize, take: safeSize };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page = 1,
  pageSize = 20,
): PaginatedResponse<T> {
  const safeSize = Math.min(100, Math.max(1, pageSize));
  return {
    data,
    meta: {
      page: Math.max(1, page),
      pageSize: safeSize,
      total,
      totalPages: Math.ceil(total / safeSize),
    },
  };
}
