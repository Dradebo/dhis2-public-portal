import React from 'react';
import { LinearLoader, Tag } from '@dhis2/ui';
import i18n from '@dhis2/d2-i18n';
import { ValidationSummary } from './hooks/validation';
import { DataServiceRunStatus } from '@packages/shared/schemas';

interface ValidationProgressProps {
    status?: ValidationSummary;
}

export function ValidationProgress({ status }: ValidationProgressProps) {
    if (!status) {
        return (
            <div className="p-4 bg-gray-50 rounded">
                <p className="text-gray-600">{i18n.t('No validation status available')}</p>
            </div>
        );
    }

    const getStatusText = (status: DataServiceRunStatus) => {
        switch (status) {
            case DataServiceRunStatus.RUNNING:
                return i18n.t('Running');
            case DataServiceRunStatus.COMPLETED:
                return i18n.t('Completed');
            case DataServiceRunStatus.FAILED:
                return i18n.t('Failed');
            case DataServiceRunStatus.QUEUED:
                return i18n.t('Queued');
            case DataServiceRunStatus.IDLE:
                return i18n.t('Idle');
            default:
                return i18n.t('Unknown');
        }
    };

    return (
        <div className="space-y-3">
            {/* Status and Progress */}
            <div className="flex items-center justify-between">
                <Tag positive={status.status === DataServiceRunStatus.COMPLETED}>
                    {getStatusText(status.status)}
                </Tag>

                <div className="text-right">
                    <div className="text-lg font-semibold">{status.progress}%</div>
                    <div className="text-sm text-gray-600">
                        {status.recordsProcessed.toLocaleString()} / {status.totalRecords.toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            {status.status === DataServiceRunStatus.RUNNING && (
                <LinearLoader amount={status.progress} />
            )}

            {/* Key Metrics Only */}
            <div className="flex gap-6 text-sm">
                <span>
                    <strong className="text-green-600">{status.recordsMatched.toLocaleString()}</strong> {i18n.t('matched')}
                </span>
                <span>
                    <strong className="text-orange-600">{status.discrepanciesFound.toLocaleString()}</strong> {i18n.t('issues')}
                </span>
                {status.criticalDiscrepancies > 0 && (
                    <span>
                        <strong className="text-red-600">{status.criticalDiscrepancies}</strong> {i18n.t('critical')}
                    </span>
                )}
            </div>
        </div>
    );
}