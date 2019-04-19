// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { AxeResults } from 'axe-core';
import * as fs from 'fs';
import { sortBy } from 'lodash';
import { IMock, It, Mock, Times } from 'typemoq';
import { convertAxeToSarif } from '.';
import { AxeRawResult } from './axe-raw-result';
import {
    AxeRawSarifConverter,
    defaultAxeRawSarifConverter,
} from './axe-raw-sarif-converter';
import { ConverterOptions } from './converter-options';
import { EnvironmentData } from './environment-data';
import { getInvocations } from './invocation-provider';
import * as Sarif from './sarif/sarif-2.0.0';
import { SarifLog } from './sarif/sarif-log';

function normalizeSarif(sarif: SarifLog): void {
    sarif.runs[0].results = sortBy(sarif.runs[0].results, [
        'ruleId',
        'partialFingerprints.fullyQualifiedLogicalName',
        'level',
    ]);
    sarif.runs[0].resources!.rules = sortBy(sarif.runs[0].resources!.rules, [
        'id',
    ]) as any;
}

describe('AxeRawSarifConverter', () => {
    describe('integrated with default dependencies', () => {
        let testSubject: AxeRawSarifConverter;

        beforeEach(() => {
            testSubject = defaultAxeRawSarifConverter();
        });

        it('produces the same output as the v2 converter for equivalent raw input', () => {
            const axeJSON: string = fs.readFileSync(
                './src/test-resources/axe-v3.2.2.reporter-v2.json',
                'utf8',
            );
            const axeResult: AxeResults = JSON.parse(axeJSON) as AxeResults;
            const axeToSarifOutput = convertAxeToSarif(axeResult);

            const axeRawJSON: string = fs.readFileSync(
                './src/test-resources/axe-v3.2.2.reporter-raw.json',
                'utf8',
            );
            const axeRawResult: AxeRawResult[] = JSON.parse(
                axeRawJSON,
            ) as AxeRawResult[];

            const environmentDataStub: EnvironmentData = {
                timestamp: axeResult.timestamp,
                targetPageUrl: axeResult.url,
                targetPageTitle: '',
            };

            const axeRawToSarifOutput = testSubject.convert(
                axeRawResult,
                {},
                environmentDataStub,
            );

            normalizeSarif(axeRawToSarifOutput);
            normalizeSarif(axeToSarifOutput);

            expect(axeRawToSarifOutput).toEqual(axeToSarifOutput);
        });
    });

    describe('convert', () => {
        it('outputs a sarif log whose run uses the invocationsProvider to populate the invocations property', () => {
            const stubEnvironmentData = {
                targetPageUrl: 'stub_url',
            } as EnvironmentData;

            const stubInvocations: Sarif.Invocation[] = [
                { commandLine: 'stub_invocation' },
            ];

            const invocationProviderMock: IMock<
                (environmentData: EnvironmentData) => Sarif.Invocation[]
            > = Mock.ofInstance(getInvocations);

            invocationProviderMock
                .setup(ip =>
                    ip(It.isObjectWith<EnvironmentData>(stubEnvironmentData)),
                )
                .returns(() => stubInvocations)
                .verifiable(Times.once());

            const testSubject = new AxeRawSarifConverter(
                invocationProviderMock.object,
            );
            const irrelevantResults: AxeRawResult[] = [];
            const irrelevantOptions: ConverterOptions = {};

            const actualResults = testSubject.convert(
                irrelevantResults,
                irrelevantOptions,
                stubEnvironmentData,
            );

            invocationProviderMock.verifyAll();
            expect(actualResults).toHaveProperty('runs');
            expect(actualResults.runs[0]).toHaveProperty(
                'invocations',
                stubInvocations,
            );
        });
    });
});