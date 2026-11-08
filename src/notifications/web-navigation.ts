import { ApiProperty } from '@nestjs/swagger'
import type { Prisma } from '../generated/prisma/client'
import { publicPushTarget } from '../push/push-targets'
export class WebNotificationNavigationDto {
  @ApiProperty() path!: string
  @ApiProperty({ enum: ['ADMIN', 'STOREFRONT'] }) surface!: string
}
export async function webNavigation(
  tx: Prisma.TransactionClient,
  type: string,
  id: string | null,
  surface: string,
) {
  if (surface === 'ADMIN') {
    if (type === 'ORDER' || type === 'TRACKING')
      return { path: '/orders?order=' + id, surface }
    const routes: Record<string, string> = {
      HOME: '/dashboard',
      PRODUCT: '/products',
      CATEGORY: '/categories',
      COLLECTION: '/content',
      OFFER: '/promotions',
    }
    return { path: routes[type] || '/notifications', surface }
  }
  if (type === 'ORDER') return { path: '/account/orders/' + id, surface }
  if (type === 'TRACKING') return { path: '/track?order=' + id, surface }
  return { path: await publicPushTarget(tx, type, id), surface }
}
