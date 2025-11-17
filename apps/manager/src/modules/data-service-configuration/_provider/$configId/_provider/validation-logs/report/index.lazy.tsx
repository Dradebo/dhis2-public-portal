import React, { Suspense, lazy, FC } from 'react';
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import i18n from "@dhis2/d2-i18n";
import { ModuleContainer } from '../../../../../../../shared/components/ModuleContainer';

export const Route = createLazyFileRoute(
    "/data-service-configuration/_provider/$configId/_provider/validation-logs/report/",
)({
    component: RouteComponent,
});

function RouteComponent() {
    return (
        <ModuleContainer title={i18n.t("Generated Report")}>
            <></>
        </ModuleContainer>
    );
}