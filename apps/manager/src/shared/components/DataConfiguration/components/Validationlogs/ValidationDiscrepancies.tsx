import React from 'react';
import {
    CircularLoader,
    NoticeBox,
    Table,
    TableHead,
    TableRowHead,
    TableCellHead,
    TableBody,
    TableRow,
    TableCell,
    Button
} from '@dhis2/ui';
import i18n from '@dhis2/d2-i18n';
import { PeriodUtility, PeriodTypeCategory } from '@hisptz/dhis2-utils';

interface ValidationDiscrepancy {
    id: string;
    dataElement: string;
    dataElementName: string;
    orgUnit: string;
    orgUnitName: string;
    period: string;
    categoryOptionCombo: string;
    attributeOptionCombo?: string;
    sourceValue: string | number | null;
    destinationValue: string | number | null;
    discrepancyType: "missing_in_destination" | "missing_in_source" | "value_mismatch" | "metadata_mismatch";
    severity: "critical" | "major" | "minor";
    details?: string;
}

interface DiscrepancySummary {
    total: number;
    critical: number;
    major: number;
    minor: number;
    byType: Record<string, number>;
    byDataElement: Record<string, number>;
}

interface ValidationDiscrepanciesProps {
    discrepancies: ValidationDiscrepancy[];
    summary?: DiscrepancySummary;
    isLoading: boolean;
    error: Error | null;
}

export function ValidationDiscrepancies({ discrepancies, summary, isLoading, error }: ValidationDiscrepanciesProps) {
     const handleDownloadCSV = () => {
        if (!discrepancies.length) return;
         const periodDataMap = new Map();
        const dataElements = new Set();
        const dataElementNames = new Map();

        discrepancies.forEach((discrepancy) => {
            const dataElementCombo = discrepancy.dataElement;
            dataElements.add(dataElementCombo);
            dataElementNames.set(dataElementCombo, discrepancy.dataElementName);
            if (!periodDataMap.has(discrepancy.period)) {
                periodDataMap.set(discrepancy.period, new Map());
            }
            const periodMap = periodDataMap.get(discrepancy.period);
            periodMap.set(dataElementCombo, {
                source: discrepancy.sourceValue,
                destination: discrepancy.destinationValue
            });
        });

        const dataElementsList = Array.from(dataElements);
        const periods = Array.from(periodDataMap.keys()).sort();

        // Build CSV header: Period, then for each data element: Source, Destination
        const header = [
            'Period',
            ...dataElementsList.flatMap(de => [
                `${dataElementNames.get(de)} (Source)`,
                `${dataElementNames.get(de)} (Destination)`
            ])
        ];

        // Build rows
        const rows = periods.map(period => {
            const periodMap = periodDataMap.get(period);
            return [
                formatPeriod(period),
                ...dataElementsList.flatMap(de => {
                    const data = periodMap.get(de) || {};
                    return [data.source ?? '', data.destination ?? ''];
                })
            ];
        });

        const csvContent = [header, ...rows]
            .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'validation-discrepancies-table.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const formatValue = (value: string | number | null) => {
        if (value === null || value === undefined) {
            return <span className="text-gray-400 italic">{i18n.t('No value')}</span>;
        }
        return String(value);
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical':
                return 'bg-red-100 border-red-300';
            case 'major':
                return 'bg-yellow-100 border-yellow-300';
            case 'minor':
                return 'bg-yellow-100 border-yellow-300';
            default:
                return '';
        }
    };

    const getSeverityTextColor = (severity: string) => {
        switch (severity) {
            case 'critical':
                return 'text-red-700';
            case 'major':
                return 'text-yellow-700';
            case 'minor':
                return 'text-yellow-700';
            default:
                return '';
        }
    };

    const formatPeriod = (periodId: string): string => {
        try {
            const period = PeriodUtility.getPeriodById(periodId);
            if (period) {
                if (period.type?.type === PeriodTypeCategory.FIXED) {
                    return period.name || periodId;
                }
                return period.name || periodId;
            }
            return periodId;
        } catch (error) {
            return periodId;
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <CircularLoader />
            </div>
        );
    }

    if (error) {
        return (
            <NoticeBox error title={i18n.t('Failed to load validation discrepancies')}>
                {error.message || i18n.t('An error occurred while loading the validation discrepancies')}
            </NoticeBox>
        );
    }

    if (discrepancies.length === 0) {
        return (
            <NoticeBox title={i18n.t('No discrepancies found')}>
                {i18n.t('Great! No discrepancies were found between the source and destination data.')}
            </NoticeBox>
        );
    }

    return (
        <div>
            <div className="mb-4 flex justify-between items-center">
                <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-red-100 border border-red-300 rounded"></div>
                        <span className="text-sm  font-medium">{i18n.t('When destination data is greater than source data')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-yellow-100 border border-yellow-300 rounded"></div>
                        <span className="text-sm  font-medium">{i18n.t('When source data is greater than destination data')}</span>
                    </div>
                </div>
                <Button
                    small
                    onClick={handleDownloadCSV}
                    disabled={discrepancies.length === 0}
                >
                    {i18n.t('Download')}
                </Button>
            </div>
            {(() => {
                const periodDataMap = new Map<string, Map<string, { source: any; destination: any; hasDiscrepancy: boolean }>>();
                const dataElements = new Set<string>();
                const dataElementNames = new Map<string, string>();

                discrepancies.forEach((discrepancy) => {
                    const dataElementCombo = discrepancy.dataElement;

                    dataElements.add(dataElementCombo);
                    dataElementNames.set(dataElementCombo, discrepancy.dataElementName);

                    if (!periodDataMap.has(discrepancy.period)) {
                        periodDataMap.set(discrepancy.period, new Map());
                    }

                    const periodMap = periodDataMap.get(discrepancy.period)!;
                    const hasDiscrepancy = discrepancy.discrepancyType === 'value_mismatch' ||
                        discrepancy.discrepancyType === 'missing_in_destination';

                    periodMap.set(dataElementCombo, {
                        source: discrepancy.sourceValue,
                        destination: discrepancy.destinationValue,
                        hasDiscrepancy
                    });
                });

                const dataElementsList = Array.from(dataElements);
                const periods = Array.from(periodDataMap.keys()).sort();

                return (
                    <div className="w-full overflow-x-auto ">
                        <div style={{ minWidth: `${Math.max(1200, dataElementsList.length * 200)}px` }}>
                            <Table>
                                <TableHead>
                                    <TableRowHead>
                                        <TableCellHead>{i18n.t('Period')}</TableCellHead>
                                        {dataElementsList.map((dataElementCombo) => {
                                            return (
                                                <TableCellHead
                                                    key={dataElementCombo}
                                                    colSpan="2"
                                                    className="text-center"
                                                >
                                                    <div className="whitespace-nowrap text-xs min-w-44">
                                                        <div className="font-medium">{dataElementNames.get(dataElementCombo)}</div>

                                                    </div>
                                                </TableCellHead>
                                            );
                                        })}
                                    </TableRowHead>
                                    <TableRowHead>
                                        <TableCellHead></TableCellHead>
                                        {dataElementsList.map((dataElementCombo) => (
                                            <React.Fragment key={dataElementCombo}>
                                                <TableCellHead className="text-center text-xs">
                                                    <div className="min-w-20 whitespace-nowrap">{i18n.t('Source')}</div>
                                                </TableCellHead>
                                                <TableCellHead className="text-center text-xs">
                                                    <div className="min-w-20 whitespace-nowrap">{i18n.t('Destination')}</div>
                                                </TableCellHead>
                                            </React.Fragment>
                                        ))}
                                    </TableRowHead>
                                </TableHead>
                                <TableBody>
                                    {periods.map((period) => {
                                        const periodData = periodDataMap.get(period)!;
                                        return (
                                            <TableRow key={period}>
                                                <TableCell className="font-medium">
                                                    <div className="whitespace-nowrap">{formatPeriod(period)}</div>
                                                </TableCell>
                                                {dataElementsList.map((dataElementCombo) => {
                                                    const data = periodData.get(dataElementCombo);
                                                    const sourceValue = data?.source ?? null;
                                                    const destinationValue = data?.destination ?? null;
                                                    const hasDiscrepancy = data?.hasDiscrepancy ?? false;
 
                                                    const discrepancy = discrepancies.find(d => 
                                                        d.dataElement === dataElementCombo && 
                                                        d.period === period
                                                    );
                                                    const severity = discrepancy?.severity || 'minor';

                                                    return (
                                                        <React.Fragment key={dataElementCombo}>
                                                            <TableCell className="text-center">
                                                                <div className="whitespace-nowrap min-w-20 px-2">
                                                                    {formatValue(sourceValue)}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell
                                                                className={hasDiscrepancy
                                                                    ? `text-center font-medium border ${getSeverityColor(severity)} ${getSeverityTextColor(severity)}`
                                                                    : "text-center"
                                                                }
                                                            >
                                                                <div className="whitespace-nowrap min-w-20 px-2">
                                                                    {formatValue(destinationValue)}
                                                                </div>
                                                            </TableCell>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
}