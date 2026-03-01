"use client";

import React from 'react';
import { useParams } from 'next/navigation';
import ClicrPanel from './ClicrPanel';

export default function ClicrPage() {
    const { id } = useParams();
    const clicrId = typeof id === 'string' ? id : undefined;

    return (
        <div className="h-[100vh] bg-black">
            <ClicrPanel clicrId={clicrId} className="h-full" />
        </div>
    );
}
