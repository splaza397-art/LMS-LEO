import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limita solo operaciones de escritura. Las lecturas del portal llegan desde su servidor con una
 * misma IP, por lo que contarlas por IP bloquearia a todos los visitantes a la vez.
 */
@Injectable()
export class WriteThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const { method } = context.switchToHttp().getRequest();
    return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  }
}
