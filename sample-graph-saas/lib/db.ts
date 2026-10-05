import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()
export const db = prisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } })
}

export async function getUserSettings(userId: string) {
  return prisma.settings.findUnique({ where: { userId } })
}
