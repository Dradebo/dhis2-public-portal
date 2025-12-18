import ExcelJS from 'exceljs';
import { PeriodUtility, PeriodTypeCategory } from '@hisptz/dhis2-utils';
import { ValidationDiscrepancy } from './interfaces/interfaces';



const SEVERITY_COLORS = {
    critical: {
        fill: 'FFFEF2F2',
        font: 'FFB91C1C'
    },
    minor: {
        fill: 'FFFEFCE8',
        font: 'FFA16207'
    }
};

function formatPeriod(periodId: string): string {
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
}

export async function exportDiscrepanciesToExcel(discrepancies: ValidationDiscrepancy[]): Promise<void> {
    if (!discrepancies.length) return;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DHIS2 Validation';
    workbook.created = new Date();

    const dataSheet = workbook.addWorksheet('Discrepancies', {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
    });

    const periodDataMap = new Map<string, Map<string, { source: any; destination: any }>>();
    const dataElements = new Set<string>();
    const dataElementNames = new Map<string, string>();
    const discrepancyMap = new Map<string, ValidationDiscrepancy>();

    discrepancies.forEach((discrepancy) => {
        const dataElementCombo = discrepancy.dataElement;
        dataElements.add(dataElementCombo);
        dataElementNames.set(dataElementCombo, discrepancy.dataElementName);

        if (!periodDataMap.has(discrepancy.period)) {
            periodDataMap.set(discrepancy.period, new Map());
        }

        const periodMap = periodDataMap.get(discrepancy.period)!;
        const key = `${discrepancy.period}-${dataElementCombo}`;

        periodMap.set(dataElementCombo, {
            source: discrepancy.sourceValue,
            destination: discrepancy.destinationValue
        });

        discrepancyMap.set(key, discrepancy);
    });

    const dataElementsList = Array.from(dataElements);
    const periods = Array.from(periodDataMap.keys()).sort();

    // Build header row 1 (Data Element Names)
    const headerRow1: string[] = ['Period'];
    dataElementsList.forEach(de => {
        headerRow1.push(dataElementNames.get(de) || de);
        headerRow1.push('');
    });

    // Build header row 2 (Source/Destination)
    const headerRow2: string[] = [''];
    dataElementsList.forEach(() => {
        headerRow2.push('Source');
        headerRow2.push('Destination');
    });

    // Add headers
    const row1 = dataSheet.addRow(headerRow1);
    const row2 = dataSheet.addRow(headerRow2);

    row1.eachCell((cell, colNumber) => {
        cell.font = { bold: true };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5F5' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
        };
    });

    row2.eachCell((cell, colNumber) => {
        cell.font = { bold: true, size: 10 };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5F5' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
        };
    });

    for (let i = 0; i < dataElementsList.length; i++) {
        const startCol = 2 + (i * 2);
        const endCol = startCol + 1;
        dataSheet.mergeCells(1, startCol, 1, endCol);
    }

    periods.forEach((period, periodIndex) => {
        const periodMap = periodDataMap.get(period)!;
        const rowData: (string | number | null)[] = [formatPeriod(period)];

        dataElementsList.forEach(de => {
            const data = periodMap.get(de);
            rowData.push(data?.source ?? '');
            rowData.push(data?.destination ?? '');
        });

        const dataRow = dataSheet.addRow(rowData);
        const rowNumber = periodIndex + 3;

        const periodCell = dataRow.getCell(1);
        periodCell.font = { bold: true };
        periodCell.border = {
            top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
        };

        dataElementsList.forEach((de, deIndex) => {
            const sourceColNum = 2 + (deIndex * 2);
            const destColNum = sourceColNum + 1;

            const sourceCell = dataRow.getCell(sourceColNum);
            const destCell = dataRow.getCell(destColNum);

            [sourceCell, destCell].forEach(cell => {
                cell.alignment = { horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
                };
            });

            const key = `${period}-${de}`;
            const discrepancy = discrepancyMap.get(key);

            if (discrepancy && (discrepancy.discrepancyType === 'value_mismatch' || discrepancy.discrepancyType === 'missing_in_destination')) {
                const colors = SEVERITY_COLORS[discrepancy.severity];
                destCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: colors.fill }
                };
                destCell.font = {
                    bold: true,
                    color: { argb: colors.font }
                };
            }
        });
    });

    dataSheet.getColumn(1).width = 20;
    for (let i = 2; i <= 1 + dataElementsList.length * 2; i++) {
        dataSheet.getColumn(i).width = 15;
    }

    const legendSheet = workbook.addWorksheet('Legend');
    legendSheet.addRow(['Severity', 'Description', 'Color']);

    const legendHeader = legendSheet.getRow(1);
    legendHeader.eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5F5' }
        };
    });

    // Add legend entries
    const criticalRow = legendSheet.addRow(['Critical', 'When destination data is greater than source data', '']);
    criticalRow.getCell(3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: SEVERITY_COLORS.critical.fill }
    };
    criticalRow.getCell(3).font = { color: { argb: SEVERITY_COLORS.critical.font } };
    criticalRow.getCell(3).value = 'Sample';

    const minorRow = legendSheet.addRow(['Minor', 'Small data difference', '']);
    minorRow.getCell(3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: SEVERITY_COLORS.minor.fill }
    };
    minorRow.getCell(3).font = { color: { argb: SEVERITY_COLORS.minor.font } };
    minorRow.getCell(3).value = 'Sample';

    legendSheet.getColumn(1).width = 15;
    legendSheet.getColumn(2).width = 40;
    legendSheet.getColumn(3).width = 15;

    // Generate file and trigger download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'validation-discrepancies.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
