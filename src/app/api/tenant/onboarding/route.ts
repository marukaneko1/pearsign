/**
 * Tenant Onboarding API
 *
 * GET - Get onboarding status and setup progress
 * PUT - Update onboarding progress
 * DELETE - Dismiss walkthrough
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';
import {
  TenantOnboardingService,
  initializeOnboardingTable
} from '@/lib/tenant-onboarding';

/**
 * GET /api/tenant/onboarding
 * Get onboarding status for the current tenant
 */
export const GET = withTenant(
  async (_request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      await initializeOnboardingTable();

      const [status, progress] = await Promise.all([
        TenantOnboardingService.getOnboardingStatus(tenantId),
        TenantOnboardingService.getSetupProgress(tenantId),
      ]);

      const isFirstLogin = await TenantOnboardingService.isFirstLogin(tenantId);

      return NextResponse.json({
        success: true,
        status,
        progress,
        isFirstLogin,
        shouldShowWalkthrough: isFirstLogin || status.showWalkthrough,
      });
    } catch (error) {
      console.error('[Onboarding] Error getting status:', error);
      return NextResponse.json(
        { error: 'Failed to get onboarding status' },
        { status: 500 }
      );
    }
  }
);

/**
 * PUT /api/tenant/onboarding
 * Update onboarding progress
 */
export const PUT = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { action, stepId, currentStep, completed, skipped } = body;

      await initializeOnboardingTable();

      switch (action) {
        case 'updateStep':
          const status = await TenantOnboardingService.updateProgress(tenantId, {
            stepId,
            completed,
            skipped,
          });
          return NextResponse.json({ success: true, status });

        case 'setStep':
          const stepStatus = await TenantOnboardingService.updateProgress(tenantId, {
            currentStep,
          });
          return NextResponse.json({ success: true, status: stepStatus });

        case 'complete':
          await TenantOnboardingService.completeOnboarding(tenantId);
          return NextResponse.json({ success: true, message: 'Onboarding completed' });

        case 'reopen':
          await TenantOnboardingService.reopenWalkthrough(tenantId);
          return NextResponse.json({ success: true, message: 'Walkthrough reopened' });

        default:
          return NextResponse.json(
            { error: 'Invalid action' },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('[Onboarding] Error updating:', error);
      return NextResponse.json(
        { error: 'Failed to update onboarding' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/tenant/onboarding
 * Dismiss the walkthrough
 */
export const DELETE = withTenant(
  async (_request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      await initializeOnboardingTable();
      await TenantOnboardingService.dismissWalkthrough(tenantId);

      return NextResponse.json({
        success: true,
        message: 'Walkthrough dismissed',
      });
    } catch (error) {
      console.error('[Onboarding] Error dismissing:', error);
      return NextResponse.json(
        { error: 'Failed to dismiss walkthrough' },
        { status: 500 }
      );
    }
  }
);
