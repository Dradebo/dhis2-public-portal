import React, { useState } from 'react';
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import i18n from "@dhis2/d2-i18n";
import { ModuleContainer } from '../../../../../shared/components/ModuleContainer';
import { ValidationLogsPage } from '../../../../../shared/components/DataConfiguration/components/Validationlogs/ValidationLogsPage';
 
export const Route = createLazyFileRoute(
    "/data-service-configuration/_provider/$configId/validation-logs/",
)({
    component: RouteComponent,
});

function RouteComponent() {
    const { configId } = Route.useParams();
    
    return (
        <ModuleContainer title={i18n.t("Data Validation Logs")}>
            <ValidationLogsPage configId={configId} />
        </ModuleContainer>
    );
}