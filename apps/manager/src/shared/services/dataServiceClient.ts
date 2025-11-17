export interface ApiResponse {
    success: boolean;
    message: string;
    data?: any;
    filesDeleted?: number;
    totalSizeDeleted?: string;
    queues?: string[];
}

 export async function executeDataServiceRoute(
    engine: any,
    endpoint: string,
    data?: any,
    method: 'create' | 'delete' = 'create'
): Promise<ApiResponse> {
    try {
        const result = await engine.mutate({
            type: method,
            resource: `routes/data-service/run/${endpoint}`,
            data: data || {},
        });
        return result as ApiResponse;
    } catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(`API call failed: ${String(error)}`);
    }
}

// Helper function to query DHIS2 engine for data service routes  
export async function queryDataServiceRoute(
    engine: any,
    endpoint: string
): Promise<ApiResponse> {
    try {
        const result = await engine.query({
            result: {
                resource: `routes/data-service/run/${endpoint}`,
            },
        });
        return result.result as ApiResponse;
    } catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(`Query failed: ${String(error)}`);
    }
}

export async function downloadMetadata(engine: any, configId: string, data: any): Promise<ApiResponse> {
    return executeDataServiceRoute(engine, `/metadata-download/${configId}`, data);
}

export async function downloadData(engine: any, configId: string, data: any): Promise<ApiResponse> {
    return executeDataServiceRoute(engine, `/data-download/${configId}`, data);
}

export async function startDataDeletion(engine: any, configId: string, data: any): Promise<ApiResponse> {
    return executeDataServiceRoute(engine, `/data-delete/${configId}`, data);
}
 
export async function validateData(engine: any, configId: string, data: any): Promise<ApiResponse> {
    return executeDataServiceRoute(engine, `/data-validation/${configId}`, data);
}
 
export async function createQueues(engine: any, configId: string): Promise<ApiResponse> {
    return executeDataServiceRoute(engine, `/queues/${configId}`, { action: 'create' });
}

export async function deleteQueues(engine: any, configId: string): Promise<ApiResponse> {
    return executeDataServiceRoute(engine, `/queues/${configId}`, {}, 'delete');
} 

export async function getConfigStatus(engine: any, configId: string): Promise<ApiResponse> {
    try {
        const response = await queryDataServiceRoute(engine, `/status/${configId}`);
        console.log(`getConfigStatus response for ${configId}:`, response);
        return response;
    } catch (error) {
        console.error(`getConfigStatus error for ${configId}:`, error);
        throw error;
    }
}

export async function getFailedQueue(engine: any, configId: string, options: { 
    limit?: number; 
    offset?: number; 
    includeMessages?: boolean;
    queue?: string;
    onlyQueues?: boolean;
} = {}): Promise<ApiResponse> {
    try {
        const { limit = 50, offset = 0, includeMessages = false, queue, onlyQueues = false } = options;
        const queryParams = new URLSearchParams({
            limit: limit.toString(),
            offset: offset.toString(),
        });
        
        if (includeMessages) {
            queryParams.set('includeMessages', 'true');
        }
        
        if (onlyQueues) {
            queryParams.set('onlyQueues', 'true');
        }
        
        if (queue) {
            queryParams.set('queue', queue);
        }
        
        const response = await queryDataServiceRoute(engine, `/failed-queue/${configId}?${queryParams}`);
         return response;
    } catch (error) {
        console.error(`getFailedQueue error for ${configId}:`, error);
        throw error;
    }
}

export async function getFailedQueueSources(engine: any, configId: string): Promise<ApiResponse> {
    try {
        const response = await queryDataServiceRoute(engine, `/failed-queue/${configId}?onlyQueues=true`);
         return response;
    } catch (error) {
         throw error;
    }
}

export async function clearFailedQueue(engine: any, configId: string): Promise<ApiResponse> {
    return executeDataServiceRoute(engine, `/failed-queue/${configId}`, {}, 'delete');
}

// Retry operations
export async function retryByProcessType(
    engine: any,
    configId: string, 
    processType: 'data-upload' | 'metadata-upload' | 'data-download' | 'metadata-download' | 'data-delete',
    maxRetries: number = 10
): Promise<ApiResponse> {
    return executeDataServiceRoute(engine, `/retry/${configId}`, { maxRetries });
}

export async function retrySingleMessage(engine: any, configId: string, messageId: string): Promise<ApiResponse> {
    return executeDataServiceRoute(engine, `/retry/${configId}/message/${messageId}`, {});
}
