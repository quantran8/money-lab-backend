import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class CamelCaseInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(map((data) => this.transform(data)));
    }

    private transform(data: any): any {
        if (data === null || data === undefined) {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map((item) => this.transform(item));
        }

        // Check if it's a plain object or a Prisma model object
        // We avoid transforming Dates, BigInts, etc.
        if (typeof data === 'object') {
            // If it's a Date or other non-plain-object type we want to preserve, return it
            if (data instanceof Date || data instanceof Buffer) {
                return data;
            }

            // If it has a custom toJSON (like Decimal.js used by Prisma), use it first?
            // Actually, NestJS will call toJSON anyway before sending the response.
            // But we need to transform the keys of the resulting object.

            const result = {};
            for (const key of Object.keys(data)) {
                const camelKey = key.replace(/([-_][a-z])/gi, ($1) =>
                    $1.toUpperCase().replace('-', '').replace('_', ''),
                );

                let value = data[key];
                // Handle BigInt conversion here too, as it's a common issue in NestJS/Prisma
                if (typeof value === 'bigint') {
                    value = value.toString();
                }

                result[camelKey] = this.transform(value);
            }
            return result;
        }

        return data;
    }
}
