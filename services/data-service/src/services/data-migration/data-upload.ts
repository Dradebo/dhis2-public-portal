import logger from "@/logging";
import { dhis2Client } from "@/clients/dhis2";
import { displayUploadSummary } from "@/services/summary";
import { AxiosError } from "axios";
import * as fs from "node:fs";

const IMMEDIATE_RETRY_COUNT = 1;
const RETRY_DELAYS = [2000];

function isRetryableError(error: any): boolean {
    if (!(error instanceof AxiosError)) return false;
    if (!error.response) {
        return error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNRESET' ||
            error.code === 'ENOTFOUND' ||
            error.message?.includes('timeout') ||
            error.message?.includes('network');
    }
    const status = error.response.status;
    return status === 502 || status === 503 || status === 504 || status === 408;
}
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface DataUploadJob {
    mainConfigId: string;
    filename?: string;
    payload?: any;
    queuedAt?: string;
    downloadedFrom?: string;
}

export async function dataFromQueue(jobData: any): Promise<void> {
    try {
        const { mainConfigId, filename, payload, isDelete } = jobData;

        if (!validateUploadJobData(jobData)) {
            throw new Error(`Invalid job data for config: ${mainConfigId}`);
        }
        if (payload) {
            await dataFromPayload({ payload, configId: mainConfigId, filename, isDelete });
        } else if (filename) {
            await dataFromFile({ filename, configId: mainConfigId, isDelete });
        } else {
            throw new Error(`No payload or filename provided for job`);
        }
    } catch (error: any) {
        logger.error(`Error processing data job:`, {
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
            },
        });
        throw error;
    }
}

function validateUploadJobData(jobData: any): boolean {
    const { mainConfigId, filename, payload } = jobData;

    if (!mainConfigId) {
        logger.error("Missing required mainConfigId in upload job data");
        return false;
    }

    if (!filename && !payload) {
        logger.error("Missing both filename and payload in upload job data", {
            hasMainConfigId: !!mainConfigId,
            hasFilename: !!filename,
            hasPayload: !!payload,
        });
        return false;
    }

    return true;
}

export async function completeUpload(configId: string): Promise<void> {
    try {
        logger.info(`Completing upload process for config: ${configId}`);
        await displayUploadSummary(configId);
        logger.info(`Upload process completed for config: ${configId}`);
    } catch (error) {
        logger.error(`Error completing upload for config: ${configId}`, error);
        throw error;
    }
}


export async function dataFromFile({
    filename,
    configId,
    isDelete,
}: {
    filename: string;
    configId: string;
    isDelete?: boolean;
}): Promise<void> {
    try {

        if (!await fs.promises.access(filename).then(() => true).catch(() => false)) {
            throw new Error(`Data file does not exist: ${filename}`);
        }

        const fileContent = await fs.promises.readFile(filename, 'utf8');
        const payload = JSON.parse(fileContent);

        if (!payload.dataValues || !Array.isArray(payload.dataValues)) {
            throw new Error(`Invalid data file format: missing or invalid dataValues array in ${filename}`);
        }
        if (isDelete) {
            logger.info(`Starting data deletion from file: ${filename} for config: ${configId}`);
            await deleteDataValues(payload);
        } else {
            logger.info(`Starting data upload from file: ${filename} for config: ${configId}`);
            await uploadDataValues(payload);
        }

        // Clean up the file after successful upload
        await cleanupDataFile(filename);

    } catch (error: any) {
        logger.error(`Error uploading data from file ${filename}:`, {
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
            },
            configId,
        });

        // Handle specific error cases
        if (error instanceof AxiosError) {
            await handleUploadAxiosError(error, filename);
        }

        throw error;
    }
}

export async function dataFromPayload({
    payload,
    configId,
    filename,
    isDelete
}: {
    payload: any;
    configId: string;
    filename?: string;
    isDelete?: boolean;
}): Promise<void> {
    try {

        if (!payload || !payload.dataValues || !Array.isArray(payload.dataValues)) {
            throw new Error(`Invalid payload format: missing or invalid dataValues array`);
        }
        if (isDelete) {
            logger.info(`Starting data deletion from payload for config: ${configId}`);
            await deleteDataValues(payload);
        } else {
            logger.info(`Starting data upload from payload for config: ${configId}`);
            await uploadDataValues(payload);
        }

        // Clean up the file if it exists and upload was successful
        if (filename) {
            await cleanupDataFile(filename);
        }

    } catch (error: any) {
        logger.error(`Error from payload:`, {
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
            },
            configId
        });

        // Handle specific error cases
        if (error instanceof AxiosError) {
            await handleUploadAxiosError(error, filename || 'payload-upload');
        }

        throw error;
    }
}

async function uploadDataValues(payload: any): Promise<{ imported: number; ignored: number }> {
    const url = `dataValueSets`;
    const params = {
        importStrategy: "CREATE_AND_UPDATE",
        async: false,
    };

    let lastError: any;

    for (let attempt = 0; attempt <= IMMEDIATE_RETRY_COUNT; attempt++) {
        try {
            if (attempt > 0) {
                const delay = RETRY_DELAYS[attempt - 1];
                logger.info(`Retrying upload after ${delay}ms (attempt ${attempt + 1}/${IMMEDIATE_RETRY_COUNT + 1})...`);
                await sleep(delay);
            }

            const response = await dhis2Client.post(url, payload, { params });
            const importSummary = response.data?.response;

            if (!importSummary || !importSummary.importCount) {
                throw new Error("Invalid response from DHIS2 data upload");
            }

            const imported = importSummary.importCount.imported || 0;
            const ignored = importSummary.importCount.ignored || 0;
            logger.info(`Upload summary: ${imported} imported, ${ignored} ignored`);

            if (ignored > 0) {
                logger.warn(`${ignored} data values were ignored during upload`);
            }

            return { imported, ignored };
        } catch (error: any) {
            lastError = error;
            if (attempt < IMMEDIATE_RETRY_COUNT && isRetryableError(error)) {
                const errorInfo = error instanceof AxiosError
                    ? `${error.code || 'UNKNOWN'} - ${error.response?.status || 'no response'}`
                    : error.message;
                logger.warn(`Upload failed with retryable error: ${errorInfo}. Will retry...`);
                continue;
            }
            throw error;
        }
    }

    throw lastError;
}

async function deleteDataValues(payload: any): Promise<{ imported: number; ignored: number }> {
    const url = `dataValueSets`;
    const params = {
        importStrategy: "DELETE",
        async: false,
    };

    let lastError: any;
    for (let attempt = 0; attempt <= IMMEDIATE_RETRY_COUNT; attempt++) {
        try {
            if (attempt > 0) {
                const delay = RETRY_DELAYS[attempt - 1];
                logger.info(`Retrying delete after ${delay}ms (attempt ${attempt + 1}/${IMMEDIATE_RETRY_COUNT + 1})...`);
                await sleep(delay);
            }
            const response = await dhis2Client.post(url, payload, { params });
            const importSummary = response.data?.response;
            if (!importSummary || !importSummary.importCount) {
                throw new Error("Invalid response from DHIS2 data delete");
            }

            const imported = importSummary.importCount.imported || 0;
            const ignored = importSummary.importCount.ignored || 0;
            logger.info(`Delete summary: ${imported} imported, ${ignored} ignored`);

            if (ignored > 0) {
                logger.warn(`${ignored} data values were ignored during delete`);
            }

            return { imported, ignored };
        } catch (error: any) {
            lastError = error;
            if (attempt < IMMEDIATE_RETRY_COUNT && isRetryableError(error)) {
                const errorInfo = error instanceof AxiosError
                    ? `${error.code || 'UNKNOWN'} - ${error.response?.status || 'no response'}`
                    : error.message;
                logger.warn(`Delete failed with retryable error: ${errorInfo}. Will retry...`);
                continue;
            }
            throw error;
        }
    }

    throw lastError;
}



async function cleanupDataFile(filename: string): Promise<void> {
    try {
        if (await fs.promises.access(filename).then(() => true).catch(() => false)) {
            await fs.promises.unlink(filename);
            logger.info(`Successfully deleted temporary file: ${filename}`);
        }
    } catch (cleanupError) {
        logger.warn(`Failed to delete temporary file: ${filename}`, cleanupError);
    }
}

async function handleUploadAxiosError(error: AxiosError, filename: string): Promise<void> {
    const response = error.response;

    if (response?.status === 409) {
        logger.warn(`Conflicts detected of ${filename}`, {
            status: response.status,
            statusText: response.statusText
        });

        const responseData = response.data as any;
        const importSummary = responseData?.response;
        if (importSummary) {
            const imported = importSummary.importCount?.imported || 0;
            const ignored = importSummary.importCount?.ignored || 0;

            logger.info(`Conflict summary: ${imported} imported, ${ignored} ignored`);
        }

        // Clean up file even on conflicts
        await cleanupDataFile(filename);

        return;
    }

    logger.error(`HTTP error of ${filename}`, {
        status: response?.status,
        statusText: response?.statusText,
        data: response?.data,
    });
}
