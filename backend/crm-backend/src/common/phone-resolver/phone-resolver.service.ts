import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const GEORGIA_CODE = '995';
const LOCAL_DIGITS = 9;

@Injectable()
export class PhoneResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Normalize a phone string to a consistent E.164-ish format for Georgia.
   *
   * Handles inputs like:
   *   +995 555 12 34 56  →  995555123456
   *   995555123456       →  995555123456
   *   0555123456         →  995555123456
   *   555 123-456        →  995555123456
   *   (555) 123456       →  995555123456
   *
   * Returns the raw stripped digits if the input doesn't fit Georgian patterns
   * (safe fallback — never throws).
   */
  normalize(phone: string): string {
    const digits = phone.replace(/[^\d]/g, '');

    if (digits.length === LOCAL_DIGITS + GEORGIA_CODE.length && digits.startsWith(GEORGIA_CODE)) {
      return digits;
    }

    if (digits.length === LOCAL_DIGITS + 1 && digits.startsWith('0')) {
      return GEORGIA_CODE + digits.slice(1);
    }

    if (digits.length === LOCAL_DIGITS) {
      return GEORGIA_CODE + digits;
    }

    return digits;
  }

  /**
   * Extract the local 9-digit suffix used for substring matching in the DB.
   * This is the most reliable way to match since stored numbers may or may
   * not include the country code.
   */
  localDigits(phone: string): string {
    const digits = phone.replace(/[^\d]/g, '');
    return digits.length >= LOCAL_DIGITS ? digits.slice(-LOCAL_DIGITS) : digits;
  }

  /**
   * Build a Prisma OR filter to match a list of phones against
   * CallSession.callerNumber / calleeNumber.
   */
  buildCallSessionFilter(
    phones: string[],
  ): Array<
    | { callerNumber: { contains: string } }
    | { calleeNumber: { contains: string } }
  > {
    return phones.flatMap((p) => {
      const local = this.localDigits(p);
      return [
        { callerNumber: { contains: local } },
        { calleeNumber: { contains: local } },
      ];
    });
  }

  /**
   * Resolve a phone number to an active Client (by primaryPhone or secondaryPhone).
   * Returns null if no match.
   */
  async resolveClient(phone: string) {
    const local = this.localDigits(phone);
    if (!local) return null;

    return this.prisma.client.findFirst({
      where: {
        isActive: true,
        OR: [
          { primaryPhone: { contains: local } },
          { secondaryPhone: { contains: local } },
        ],
      },
    });
  }
}
