'use server'

import { revalidatePath } from 'next/cache'
import {
  cancelTeamSubscription,
  PlanSelectionError,
  selectTeamPlan,
  SubscriptionMutationError,
} from '@/lib/payments'
import { WorkspaceAccessError } from '@/lib/workspace-context'

export type BillingActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export async function selectBillingPlanAction(
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const planIds = formData.getAll('planId')
  if (planIds.length !== 1 || typeof planIds[0] !== 'string') {
    return billingActionError(new PlanSelectionError())
  }

  let result: Awaited<ReturnType<typeof selectTeamPlan>>
  try {
    result = await selectTeamPlan(planIds[0])
  } catch (error) {
    return billingActionError(error)
  }
  if (result.changed) revalidateBillingViews()
  return {
    status: 'success',
    message: result.changed
      ? 'The plan selection was saved. No payment was processed.'
      : 'This plan was already active. No payment was processed.',
  }
}

export async function cancelBillingSubscriptionAction(
  _previous: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  let result: Awaited<ReturnType<typeof cancelTeamSubscription>>
  try {
    result = await cancelTeamSubscription()
  } catch (error) {
    return billingActionError(error)
  }
  if (result.changed) revalidateBillingViews()
  return {
    status: 'success',
    message: result.changed
      ? 'The subscription selection was cancelled.'
      : 'The subscription selection was already cancelled.',
  }
}

function revalidateBillingViews(): void {
  try {
    revalidatePath('/billing')
    revalidatePath('/checkout')
  } catch {
    // The durable transaction already committed; cache refresh cannot undo it.
  }
}

function billingActionError(error: unknown): BillingActionState {
  if (error instanceof PlanSelectionError) {
    return { status: 'error', message: 'Choose a supported plan.' }
  }
  if (error instanceof SubscriptionMutationError) {
    if (error.code === 'subscription_missing') {
      return {
        status: 'error',
        message: 'No subscription selection exists for this workspace.',
      }
    }
    if (error.code === 'subscription_state_unsupported') {
      return {
        status: 'error',
        message: 'The stored subscription state is unsupported. Select a plan to repair it.',
      }
    }
    return {
      status: 'error',
      message: 'The subscription changed. Refresh and try again.',
    }
  }
  if (error instanceof WorkspaceAccessError) {
    if (error.code === 'role_forbidden') {
      return {
        status: 'error',
        message: 'Only a current workspace owner or admin can manage billing.',
      }
    }
    return {
      status: 'error',
      message: 'Your workspace access could not be verified.',
    }
  }
  return {
    status: 'error',
    message: 'The billing selection could not be saved. Please try again.',
  }
}
