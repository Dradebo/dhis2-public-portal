import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataEngine } from "@dhis2/app-runtime";
import { DataServiceRunStatus } from "@packages/shared/schemas";
import { DataServiceConfig } from "@packages/shared/schemas";

export interface ValidationLogEntry {
	id: string;
	timestamp: string;
	level: "info" | "warn" | "error" | "success";
	message: string;
	metadata?: any;
}

export interface ValidationDiscrepancy {
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

export interface ValidationSummary {
	configId: string;
	status: DataServiceRunStatus;
	startTime: string;
	endTime?: string;
	totalRecords: number;
	recordsProcessed: number;
	recordsMatched: number;
	discrepanciesFound: number;
	criticalDiscrepancies: number;
	majorDiscrepancies: number;
	minorDiscrepancies: number;
	progress: number; // 0-100
	lastActivity?: string;
}

export interface ValidationLogsResponse {
	success: boolean;
	configId: string;
	logs: ValidationLogEntry[];
	summary: ValidationSummary;
	pagination?: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
}

export interface ValidationDiscrepanciesResponse {
	success: boolean;
	configId: string;
	discrepancies: ValidationDiscrepancy[];
	summary: {
		total: number;
		critical: number;
		major: number;
		minor: number;
		byType: Record<string, number>;
		byDataElement: Record<string, number>;
	};
	pagination?: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
}

interface ValidationSession {
	configId: string;
	status: DataServiceRunStatus;
	startTime: string;
	endTime?: string;
	logs: ValidationLogEntry[];
	discrepancies: ValidationDiscrepancy[];
	summary: ValidationSummary;
	config: {
		dataItemsConfigIds: string[];
		runtimeConfig: any;
		sourceConfig: DataServiceConfig;
	};
}

const validationSessions = new Map<string, ValidationSession>();
const addLogEntry = (configId: string, level: ValidationLogEntry['level'], message: string, metadata?: any) => {
	const session = validationSessions.get(configId);
	if (session) {
		const logEntry: ValidationLogEntry = {
			id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			timestamp: new Date().toISOString(),
			level,
			message,
			metadata
		};
		session.logs.push(logEntry);
		session.summary.lastActivity = new Date().toISOString();
	}
};

const addDiscrepancy = (configId: string, discrepancy: Omit<ValidationDiscrepancy, 'id'>) => {
	const session = validationSessions.get(configId);
	if (session) {
		const fullDiscrepancy: ValidationDiscrepancy = {
			...discrepancy,
			id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
		};
		session.discrepancies.push(fullDiscrepancy);
		session.summary.discrepanciesFound++;

		switch (discrepancy.severity) {
			case 'critical':
				session.summary.criticalDiscrepancies++;
				break;
			case 'major':
				session.summary.majorDiscrepancies++;
				break;
			case 'minor':
				session.summary.minorDiscrepancies++;
				break;
		}
	}
};

export function useValidationLogs(
	configId: string,
	options: {
		limit?: number;
		offset?: number;
		level?: string;
		autoRefresh?: boolean;
	} = {}
) {
	const { limit = 100, offset = 0, level, autoRefresh = true } = options;

	return useQuery({
		queryKey: ["validation-logs", configId, limit, offset, level],
		queryFn: async (): Promise<ValidationLogsResponse> => {
			const session = validationSessions.get(configId);
			if (!session) {
				throw new Error('Validation session not found');
			}

			let logs = session.logs;

			if (level && level !== 'all') {
				logs = logs.filter(log => log.level === level);
			}

			const paginatedLogs = logs.slice(offset, offset + limit);

			return {
				success: true,
				configId,
				logs: paginatedLogs,
				summary: session.summary,
				pagination: {
					limit,
					offset,
					total: logs.length,
					hasMore: offset + limit < logs.length
				}
			};
		},
		enabled: !!configId,
		refetchInterval: autoRefresh ? 3000 : false,
		refetchIntervalInBackground: true,
		retry: 3,
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
	});
}

export function useValidationDiscrepancies(
	configId: string,
	options: {
		limit?: number;
		offset?: number;
		severity?: string;
		type?: string;
		dataElement?: string;
	} = {}
) {
	const { limit = 50, offset = 0, severity, type, dataElement } = options;

	return useQuery({
		queryKey: ["validation-discrepancies", configId, limit, offset, severity, type, dataElement],
		queryFn: async (): Promise<ValidationDiscrepanciesResponse> => {
			const session = validationSessions.get(configId);
			if (!session) {
				throw new Error('Validation session not found');
			}
			let discrepancies = session.discrepancies;
			if (severity && severity !== 'all') {
				discrepancies = discrepancies.filter(d => d.severity === severity);
			}
			if (type && type !== 'all') {
				discrepancies = discrepancies.filter(d => d.discrepancyType === type);
			}
			if (dataElement) {
				discrepancies = discrepancies.filter(d => d.dataElement === dataElement || d.dataElementName.toLowerCase().includes(dataElement.toLowerCase()));
			}
			const paginatedDiscrepancies = discrepancies.slice(offset, offset + limit);
			const summary = {
				total: discrepancies.length,
				critical: discrepancies.filter(d => d.severity === 'critical').length,
				major: discrepancies.filter(d => d.severity === 'major').length,
				minor: discrepancies.filter(d => d.severity === 'minor').length,
				byType: discrepancies.reduce((acc, d) => {
					acc[d.discrepancyType] = (acc[d.discrepancyType] || 0) + 1;
					return acc;
				}, {} as Record<string, number>),
				byDataElement: discrepancies.reduce((acc, d) => {
					acc[d.dataElement] = (acc[d.dataElement] || 0) + 1;
					return acc;
				}, {} as Record<string, number>)
			};
			return {
				success: true,
				configId,
				discrepancies: paginatedDiscrepancies,
				summary,
				pagination: {
					limit,
					offset,
					total: discrepancies.length,
					hasMore: offset + limit < discrepancies.length
				}
			};
		},
		enabled: !!configId,
		retry: 3,
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
	});
}

export function useValidationStatus(configId: string) {
	return useQuery({
		queryKey: ["validation-status", configId],
		queryFn: async (): Promise<ValidationSummary> => {
			const session = validationSessions.get(configId);
			if (!session) {
				throw new Error('Validation session not found');
			}

			return session.summary;
		},
		enabled: !!configId,
		refetchInterval: 2000,
		refetchIntervalInBackground: true,
		retry: 3,
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
	});
}


const fetchDataFromSource = async (engine: any, sourceConfig: DataServiceConfig, dataElements: string[], periods: string[], orgUnits: string[]) => {
	try {
		const dxItems = dataElements.map(de => {
			if (de.includes('.')) {
				return de;
			} else {
				return de;
			}
		});
		const dimensions = {
			dx: dxItems,
			pe: periods,
			ou: orgUnits
		};
		const url = `routes/${sourceConfig.source.routeId}/run/analytics/dataValueSet.json`;
		const queryParams: string[] = [];
		Object.keys(dimensions).forEach((key) => {
			if (dimensions[key as keyof typeof dimensions]?.length > 0) {
				const dimensionParam = `${key}:${dimensions[key as keyof typeof dimensions]?.join(";")}`;
				queryParams.push(`dimension=${dimensionParam}`);
			}
		});
		queryParams.push('hierarchyMeta=true');
		queryParams.push('includeMetadataDetails=true');
		const queryString = queryParams.join('&');
		const fullUrl = queryString ? `${url}?${queryString}` : url;

		const query = {
			dataValues: {
				resource: fullUrl
			}
		};
		const timeoutMs = 120000;
		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(() => reject(new Error(`Source data fetch timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
		});

		const result = await Promise.race([
			engine.query(query),
			timeoutPromise
		]);
		const fetchedDataValues = result.dataValues?.dataValues || [];
		const transformedDataValues = fetchedDataValues.map((dv: any) => {
			const originalDataElement = dataElements.find(de => {
				if (de.includes('.')) {
					const [deId, coId] = de.split('.');
					return deId === dv.dataElement && coId === dv.categoryOptionCombo;
				} else {
					return de === dv.dataElement;
				}
			});

			return {
				...dv,
				dataElement: originalDataElement || (dv.categoryOptionCombo && dv.categoryOptionCombo !== 'default'
					? `${dv.dataElement}.${dv.categoryOptionCombo}`
					: dv.dataElement)
			};
		});

		return transformedDataValues;
	} catch (error) {
		console.error('Error fetching source data:', error);
		throw error;
	}
};

const fetchDataFromDestination = async (engine: any, destinationConfig: DataServiceConfig, dataElements: string[], periods: string[], orgUnits: string[]) => {
	try {
		const dxItems = dataElements.map(de => {
			if (de.includes('.')) {
				return de;
			} else {
				return de;
			}
		});
		const dimensions = {
			dx: dxItems,
			pe: periods,
			ou: orgUnits
		};
		const url = `analytics/dataValueSet.json`;
		const queryParams: string[] = [];

		Object.keys(dimensions).forEach((key) => {
			if (dimensions[key as keyof typeof dimensions]?.length > 0) {
				const dimensionParam = `${key}:${dimensions[key as keyof typeof dimensions]?.join(";")}`;
				queryParams.push(`dimension=${dimensionParam}`);
			}
		});
		queryParams.push('hierarchyMeta=true');
		queryParams.push('includeMetadataDetails=true');

		const queryString = queryParams.join('&');
		const fullUrl = queryString ? `${url}?${queryString}` : url;

		const query = {
			dataValues: {
				resource: fullUrl
			}
		};
		const timeoutMs = 120000;
		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(() => reject(new Error(`Destination data fetch timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
		});

		const result = await Promise.race([
			engine.query(query),
			timeoutPromise
		]);
		const fetchedDataValues = result.dataValues?.dataValues || [];

		const transformedDataValues = fetchedDataValues.map((dv: any) => {
			const originalDataElement = dataElements.find(de => {
				if (de.includes('.')) {
					const [deId, coId] = de.split('.');
					return deId === dv.dataElement && coId === dv.categoryOptionCombo;
				} else {
					return de === dv.dataElement;
				}
			});
			return {
				...dv,
				dataElement: originalDataElement || (dv.categoryOptionCombo && dv.categoryOptionCombo !== 'default'
					? `${dv.dataElement}.${dv.categoryOptionCombo}`
					: dv.dataElement)
			};
		});

		return transformedDataValues;
	} catch (error) {
		console.error('Error fetching destination data via direct API:', error);
		console.warn('Direct API endpoint failed for destination. This may indicate permissions or missing analytics data.');
		console.warn('Proceeding with source-only validation.');
		return [];
	}
};



// Main validation function
const performValidation = async (
	engine: any,
	configId: string,
	sourceConfig: DataServiceConfig,
	dataItemsConfigIds: string[],
	runtimeConfig: any
) => {
	const session = validationSessions.get(configId);
	if (!session) throw new Error('Validation session not found');

	try {
		session.status = DataServiceRunStatus.RUNNING;
		session.summary.status = DataServiceRunStatus.RUNNING;
		addLogEntry(configId, 'info', 'Starting data validation process');
		const savedParams = localStorage.getItem(`validation-params-${configId}`);
		if (!savedParams) {
			throw new Error('Validation parameters not found. Please restart validation from the form.');
		}
		const fullParams = JSON.parse(savedParams);
		const periods = fullParams.periods || [];
		const dataElements = fullParams.dataElements || dataItemsConfigIds;
		const orgUnits = fullParams.orgUnits || [];

		if (periods.length === 0 || dataElements.length === 0 || orgUnits.length === 0) {
			throw new Error('Missing required validation parameters: periods, data elements, or organization units');
		}
		addLogEntry(configId, 'info', `Validating ${dataElements.length} data elements across ${periods.length} periods for ${orgUnits.length} organization units`);
		if (fullParams.configDetails) {
			addLogEntry(configId, 'info', `Selected configurations: ${fullParams.configDetails.map((c: any) => `${c.name} (${c.dataItemsCount} items)`).join(', ')}`);
		}
		addLogEntry(configId, 'info', `Periods: ${periods.join(', ')}`);
		addLogEntry(configId, 'info', `Organization units: ${orgUnits.join(', ')}`);
		addLogEntry(configId, 'info', `Data elements: ${dataElements.slice(0, 5).join(', ')}${dataElements.length > 5 ? ` and ${dataElements.length - 5} more` : ''}`);

		addLogEntry(configId, 'info', 'Fetching metadata for organization units, data elements, and category option combos');
		const categoryOptionComboIds = [...new Set(
			dataElements
				.filter(de => de.includes('.'))
				.map(de => de.split('.')[1])
				.filter(coId => coId && coId !== 'default')
		)];

		const metadataPromises = [
			engine.query({
				orgUnits: {
					resource: 'organisationUnits',
					params: {
						filter: `id:in:[${orgUnits.join(',')}]`,
						fields: 'id,name',
						paging: false
					}
				}
			}).then((result: any) => result.orgUnits?.organisationUnits || []),

			engine.query({
				dataElements: {
					resource: 'dataElements',
					params: {
						filter: `id:in:[${[...new Set(dataElements.map(de => de.includes('.') ? de.split('.')[0] : de))].join(',')}]`,
						fields: 'id,name',
						paging: false
					}
				}
			}).then((result: any) => result.dataElements?.dataElements || [])
		];

		if (categoryOptionComboIds.length > 0) {
			metadataPromises.push(
				engine.query({
					categoryOptionCombos: {
						resource: 'categoryOptionCombos',
						params: {
							filter: `id:in:[${categoryOptionComboIds.join(',')}]`,
							fields: 'id,name',
							paging: false
						}
					}
				}).then((result: any) => result.categoryOptionCombos?.categoryOptionCombos || [])
			);
		}

		const metadataResults = await Promise.all(metadataPromises);
		const [orgUnitsMetadata, dataElementsMetadata, categoryOptionCombosMetadata = []] = metadataResults;

		const orgUnitNamesMap = new Map(orgUnitsMetadata.map((ou: any) => [ou.id, ou.name]));
		const dataElementNamesMap = new Map(dataElementsMetadata.map((de: any) => [de.id, de.name]));
		const categoryOptionComboNamesMap = new Map(categoryOptionCombosMetadata.map((coc: any) => [coc.id, coc.name]));
		const buildDataElementDisplayName = (dataElementId: string, categoryOptionCombo?: string): string => {
			const baseDataElementId = dataElementId.includes('.') ? dataElementId.split('.')[0] : dataElementId;
			const coId = dataElementId.includes('.') ? dataElementId.split('.')[1] : categoryOptionCombo;

			const dataElementName = dataElementNamesMap.get(baseDataElementId) as string || baseDataElementId;

			if (coId && coId !== 'default') {
				const coName = categoryOptionComboNamesMap.get(coId) as string;
				if (coName) {
					return `${dataElementName} (${coName})`;
				}
			}

			return dataElementName;
		};

		addLogEntry(configId, 'info', 'Fetching data from source instance');
		const sourceData = await fetchDataFromSource(engine, sourceConfig, dataElements, periods, orgUnits);

		const skipDestination = fullParams.skipDestination || false;

		let destinationData: any[] = [];

		if (skipDestination) {
			addLogEntry(configId, 'info', 'Skipping destination data fetch as requested (source-only validation)');
		} else {
			addLogEntry(configId, 'info', 'Fetching data from destination instance');
			destinationData = await fetchDataFromDestination(engine, sourceConfig, dataElements, periods, orgUnits);
		}

		if (destinationData.length === 0 && sourceData.length > 0) {
			addLogEntry(configId, 'warn', 'No destination data retrieved via analytics endpoint.');
			addLogEntry(configId, 'warn', 'Validation will show all source data as "missing in destination".');
			addLogEntry(configId, 'info', 'Consider checking: 1) Analytics have been run on destination, 2) Route permissions, 3) Data availability');
		}

		const createDataKey = (dv: any) => `${dv.dataElement}_${dv.period}_${dv.orgUnit}_${dv.categoryOptionCombo || 'default'}`;

		const sourceMap = new Map();
		const destinationMap = new Map();

		sourceData.forEach((dv: any) => {
			sourceMap.set(createDataKey(dv), dv);
		});

		destinationData.forEach((dv: any) => {
			destinationMap.set(createDataKey(dv), dv);
		});

		addLogEntry(configId, 'info', `Found ${sourceData.length} values in source, ${destinationData.length} values in destination`);

		if (destinationData.length === 0) {
			addLogEntry(configId, 'warn', 'Proceeding with source-only validation due to destination data limitations');
		}

		let recordsProcessed = 0;
		let recordsMatched = 0;
		const totalRecords = Math.max(sourceData.length, destinationData.length);

		for (const [key, sourceValue] of sourceMap) {
			recordsProcessed++;

			if (!destinationMap.has(key)) {
				const dataElementDisplayName = buildDataElementDisplayName(sourceValue.dataElement, sourceValue.categoryOptionCombo);
				const orgUnitName = orgUnitNamesMap.get(sourceValue.orgUnit) || sourceValue.orgUnit;

				addDiscrepancy(configId, {
					dataElement: sourceValue.dataElement,
					dataElementName: dataElementDisplayName,
					orgUnit: sourceValue.orgUnit,
					orgUnitName,
					period: sourceValue.period,
					categoryOptionCombo: sourceValue.categoryOptionCombo || 'default',
					sourceValue: sourceValue.value,
					destinationValue: null,
					discrepancyType: 'missing_in_destination',
					severity: 'major',
					details: 'Data value exists in source but not in destination'
				});
			} else {
				const destValue = destinationMap.get(key);
				if (sourceValue.value !== destValue.value) {
					const numericDiff = Math.abs(parseFloat(sourceValue.value || '0') - parseFloat(destValue.value || '0'));
					const severity = numericDiff > 100 ? 'critical' : numericDiff > 10 ? 'major' : 'minor';

					const dataElementDisplayName = buildDataElementDisplayName(sourceValue.dataElement, sourceValue.categoryOptionCombo);
					const orgUnitName = orgUnitNamesMap.get(sourceValue.orgUnit) as string || sourceValue.orgUnit;

					addDiscrepancy(configId, {
						dataElement: sourceValue.dataElement,
						dataElementName: dataElementDisplayName,
						orgUnit: sourceValue.orgUnit,
						orgUnitName,
						period: sourceValue.period,
						categoryOptionCombo: sourceValue.categoryOptionCombo || 'default',
						sourceValue: sourceValue.value,
						destinationValue: destValue.value,
						discrepancyType: 'value_mismatch',
						severity,
						details: `Source value: ${sourceValue.value}, Destination value: ${destValue.value}, Difference: ${numericDiff}`
					});
				} else {
					recordsMatched++;
				}
			}

			session.summary.recordsProcessed = recordsProcessed;
			session.summary.recordsMatched = recordsMatched;
			session.summary.progress = Math.round((recordsProcessed / totalRecords) * 100);
		}

		for (const [key, destValue] of destinationMap) {
			if (!sourceMap.has(key)) {
				const dataElementDisplayName = buildDataElementDisplayName(destValue.dataElement, destValue.categoryOptionCombo);
				const orgUnitName = orgUnitNamesMap.get(destValue.orgUnit) as string || destValue.orgUnit;

				addDiscrepancy(configId, {
					dataElement: destValue.dataElement,
					dataElementName: dataElementDisplayName,
					orgUnit: destValue.orgUnit,
					orgUnitName,
					period: destValue.period,
					categoryOptionCombo: destValue.categoryOptionCombo || 'default',
					sourceValue: null,
					destinationValue: destValue.value,
					discrepancyType: 'missing_in_source',
					severity: 'minor',
					details: 'Data value exists in destination but not in source'
				});
			}
		}


		session.status = DataServiceRunStatus.COMPLETED;
		session.summary.status = DataServiceRunStatus.COMPLETED;
		session.summary.endTime = new Date().toISOString();
		session.summary.progress = 100;
		session.summary.totalRecords = totalRecords;

		if (destinationData.length === 0 && sourceData.length > 0) {
			addLogEntry(configId, 'success', `Source-only validation completed. Processed ${totalRecords} source records`);
			addLogEntry(configId, 'info', `All ${session.summary.discrepanciesFound} discrepancies are marked as "missing in destination"`);
			addLogEntry(configId, 'info', 'Tip: Ensure analytics have been run on destination instance for complete validation');
		} else {
			addLogEntry(configId, 'success', `Full analytics-based validation completed. Found ${session.summary.discrepanciesFound} discrepancies out of ${totalRecords} records`);
		}

		return { success: true, message: 'Validation completed successfully' };

	} catch (error) {
		session.status = DataServiceRunStatus.FAILED;
		session.summary.status = DataServiceRunStatus.FAILED;
		session.summary.endTime = new Date().toISOString();

		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		addLogEntry(configId, 'error', `Validation failed: ${errorMessage}`, { error: errorMessage });

		throw error;
	}
};

// Hook for starting/re-running validation
export function useStartValidation(configId: string, sourceConfig: DataServiceConfig) {
	const queryClient = useQueryClient();
	const engine = useDataEngine();

	return useMutation({
		mutationFn: async (validationRequest: {
			dataItemsConfigIds: string[];
			runtimeConfig: any;
		}) => {
			// Initialize or reset validation session
			const session: ValidationSession = {
				configId,
				status: DataServiceRunStatus.QUEUED,
				startTime: new Date().toISOString(),
				logs: [],
				discrepancies: [],
				summary: {
					configId,
					status: DataServiceRunStatus.QUEUED,
					startTime: new Date().toISOString(),
					totalRecords: 0,
					recordsProcessed: 0,
					recordsMatched: 0,
					discrepanciesFound: 0,
					criticalDiscrepancies: 0,
					majorDiscrepancies: 0,
					minorDiscrepancies: 0,
					progress: 0
				},
				config: {
					...validationRequest,
					sourceConfig
				}
			};

			validationSessions.set(configId, session);

			// Start validation asynchronously - all processing done in frontend
			setTimeout(async () => {
				try {
					await performValidation(engine, configId, sourceConfig, validationRequest.dataItemsConfigIds, validationRequest.runtimeConfig);
				} catch (error) {
					console.error('Validation failed:', error);
					// Update session status to failed
					const currentSession = validationSessions.get(configId);
					if (currentSession) {
						currentSession.status = DataServiceRunStatus.FAILED;
						currentSession.summary.status = DataServiceRunStatus.FAILED;
						addLogEntry(configId, 'error', `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				}

				// Invalidate queries to trigger UI updates
				queryClient.invalidateQueries({ queryKey: ["validation-logs", configId] });
				queryClient.invalidateQueries({ queryKey: ["validation-status", configId] });
				queryClient.invalidateQueries({ queryKey: ["validation-discrepancies", configId] });
			}, 100);

			return { success: true, message: 'Validation started successfully' };
		},
		onSuccess: () => {
			// Invalidate and refetch all validation-related queries
			queryClient.invalidateQueries({ queryKey: ["validation-logs", configId] });
			queryClient.invalidateQueries({ queryKey: ["validation-status", configId] });
			queryClient.invalidateQueries({ queryKey: ["validation-discrepancies", configId] });
		},
	});
}

// Hook for re-running validation (uses existing session config)
export function useRerunValidation(configId: string) {
	const queryClient = useQueryClient();
	const engine = useDataEngine();

	return useMutation({
		mutationFn: async () => {
			const session = validationSessions.get(configId);
			if (!session) {
				throw new Error('No previous validation session found');
			}

			// Reset session state
			session.status = DataServiceRunStatus.QUEUED;
			session.startTime = new Date().toISOString();
			session.endTime = undefined;
			session.logs = [];
			session.discrepancies = [];
			session.summary = {
				...session.summary,
				status: DataServiceRunStatus.QUEUED,
				startTime: new Date().toISOString(),
				endTime: undefined,
				recordsProcessed: 0,
				recordsMatched: 0,
				discrepanciesFound: 0,
				criticalDiscrepancies: 0,
				majorDiscrepancies: 0,
				minorDiscrepancies: 0,
				progress: 0
			};

			// Start validation asynchronously
			setTimeout(async () => {
				try {
					await performValidation(
						engine,
						configId,
						session.config.sourceConfig,
						session.config.dataItemsConfigIds,
						session.config.runtimeConfig
					);
				} catch (error) {
					console.error('Validation failed:', error);
				}

				// Invalidate queries to trigger UI updates
				queryClient.invalidateQueries({ queryKey: ["validation-logs", configId] });
				queryClient.invalidateQueries({ queryKey: ["validation-status", configId] });
				queryClient.invalidateQueries({ queryKey: ["validation-discrepancies", configId] });
			}, 100);

			return { success: true, message: 'Validation restarted successfully' };
		},
		onSuccess: () => {
			// Invalidate and refetch all validation-related queries
			queryClient.invalidateQueries({ queryKey: ["validation-logs", configId] });
			queryClient.invalidateQueries({ queryKey: ["validation-status", configId] });
			queryClient.invalidateQueries({ queryKey: ["validation-discrepancies", configId] });
		},
	});
}

// Export functions
const exportToCSV = (data: any[]): string => {
	if (data.length === 0) return '';

	const headers = Object.keys(data[0]);
	const csvContent = [
		headers.join(','),
		...data.map(row => headers.map(header => {
			const value = row[header];
			// Escape commas and quotes in CSV
			if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
				return `"${value.replace(/"/g, '""')}"`;
			}
			return value;
		}).join(','))
	].join('\n');

	return csvContent;
};

const exportToJSON = (data: any): string => {
	return JSON.stringify(data, null, 2);
};

// Hook for exporting validation results
export function useExportValidationResults(configId: string) {
	return useMutation({
		mutationFn: async (options: {
			format: "csv" | "excel" | "json";
			includeDiscrepancies?: boolean;
			includeLogs?: boolean;
		}) => {
			const session = validationSessions.get(configId);
			if (!session) {
				throw new Error('Validation session not found');
			}

			const exportData: any = {
				summary: session.summary,
				exportedAt: new Date().toISOString()
			};

			if (options.includeDiscrepancies) {
				exportData.discrepancies = session.discrepancies;
			}

			if (options.includeLogs) {
				exportData.logs = session.logs;
			}

			let content: string;
			let mimeType: string;
			let fileExtension: string;

			switch (options.format) {
				case 'csv':
					if (options.includeDiscrepancies) {
						content = exportToCSV(session.discrepancies);
					} else {
						content = exportToCSV([session.summary]);
					}
					mimeType = 'text/csv';
					fileExtension = 'csv';
					break;
				case 'json':
					content = exportToJSON(exportData);
					mimeType = 'application/json';
					fileExtension = 'json';
					break;
				case 'excel':
					if (options.includeDiscrepancies) {
						content = exportToCSV(session.discrepancies);
					} else {
						content = exportToCSV([session.summary]);
					}
					mimeType = 'text/csv';
					fileExtension = 'csv';
					break;
				default:
					throw new Error(`Unsupported format: ${options.format}`);
			}

			return {
				content,
				mimeType,
				fileExtension,
				filename: `validation-results-${configId}-${new Date().toISOString().split('T')[0]}.${fileExtension}`
			};
		},
	});
}

export function useAnalyticsLastRun() {
	const engine = useDataEngine();

	return useQuery({
		queryKey: ["analytics-last-run"],
		queryFn: async () => {
			try {
				const result = await engine.query({
					info: {
						resource: 'system/info'
					}
				});

				const info = result.info as any;
				return {
					lastAnalyticsTableSuccess: info.lastAnalyticsTableSuccess,
					lastAnalyticsTableRuntime: info.lastAnalyticsTableRuntime,
				};
			} catch (error) {
				console.error('Error fetching analytics last run:', error);
				return null;
			}
		},
		refetchInterval: 60000,
		staleTime: 30000,
	});
}