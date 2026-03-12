import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { CountEvent, IDScanEvent, Venue, Area, Clicr } from './types';

export const exportReportsToExcel = (
    events: CountEvent[],
    scans: IDScanEvent[],
    venues: Venue[],
    areas: Area[],
    clicrs: Clicr[],
    filename: string = 'clicr-report'
) => {
    // --- 1. Aggregation Logic ---

    // A. Traffic Over Time (Hourly Buckets)
    // Map timestamps to "Hour Labels" (e.g., "10 PM", "11 PM")
    const trafficMap = new Map<string, { in: number; out: number }>();

    // Sort events by time
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    sortedEvents.forEach(e => {
        const date = new Date(e.timestamp);
        // Format: "YYYY-MM-DD HH:00" for sorting, display "HH:00"
        const hourKey = date.toLocaleString('en-US', { hour: 'numeric', hour12: true, month: 'short', day: 'numeric' }); // "Jan 30, 10 PM"

        if (!trafficMap.has(hourKey)) trafficMap.set(hourKey, { in: 0, out: 0 });
        const bucket = trafficMap.get(hourKey)!;

        // Visual charts usually want POSITIVE numbers for bars
        // IN flow adds to IN
        if (e.flow_type === 'IN') bucket.in += e.delta; // Delta can be negative for corrections, keep it algebraic? Usually traffic charts show "Volume".
        // Let's stick to "Volume" (Absolute counts) for visual charts usually.
        // But for "Net Occupancy", we need algebraic.
        // The user asked for "Traffic In/Out". Usually positive integers.
        // If delta is negative (correction), strictly it reduces total. 
        // Let's use algebraic sum for "Net Flow" but for "Traffic" usually we count people passing.
        // BUT simplistic implementation: Sum deltas.
        else if (e.flow_type === 'OUT') bucket.out += Math.abs(e.delta);
    });

    const trafficData = Array.from(trafficMap.entries()).map(([time, counts]) => ({
        'Time Period': time,
        'Entries': counts.in,
        'Exits': counts.out,
        'Net Flow': counts.in - counts.out
    }));


    // B. Age Demographics
    const ageBands = { 'Under 21': 0, '21-25': 0, '26-30': 0, '31-40': 0, '41+': 0, 'Unknown': 0 };
    scans.forEach(s => {
        const age = s.age;
        if (!age) ageBands['Unknown']++;
        else if (age < 21) ageBands['Under 21']++;
        else if (age <= 25) ageBands['21-25']++;
        else if (age <= 30) ageBands['26-30']++;
        else if (age <= 40) ageBands['31-40']++;
        else ageBands['41+']++;
    });

    const totalScans = scans.length || 1;
    const demographicData = Object.entries(ageBands).map(([band, count]) => ({
        'Age Band': band,
        'Count': count,
        'Percentage': (count / totalScans * 100).toFixed(1) + '%'
    }));


    // C. Counter Label Breakdown
    const labelCounts: Record<string, number> = {};
    events.forEach(e => {
        if (e.counter_label_id) {
            // Find label name from clicrs
            let labelName = e.counter_label_id;
            for (const c of clicrs) {
                const label = (c.counter_labels ?? []).find(l => l.id === e.counter_label_id);
                if (label) { labelName = label.label; break; }
            }
            labelCounts[labelName] = (labelCounts[labelName] || 0) + Math.abs(e.delta);
        }
    });

    const labelData = Object.entries(labelCounts).map(([label, count]) => ({
        Label: label,
        Count: count,
    }));


    // --- 2. Create Sheets ---
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
        { Metric: 'Total Entries', Value: events.filter(e => e.flow_type === 'IN').reduce((acc, e) => acc + e.delta, 0) },
        { Metric: 'Total Exits', Value: events.filter(e => e.flow_type === 'OUT').reduce((acc, e) => acc + Math.abs(e.delta), 0) },
        { Metric: 'Total Scans', Value: scans.length },
        { Metric: 'Data Range Start', Value: sortedEvents[0] ? new Date(sortedEvents[0].timestamp).toLocaleString() : 'N/A' },
        { Metric: 'Data Range End', Value: sortedEvents[sortedEvents.length - 1] ? new Date(sortedEvents[sortedEvents.length - 1].timestamp).toLocaleString() : 'N/A' },
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");

    // Chart Data Sheets
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trafficData), "Traffic Chart Data");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(demographicData), "Age Chart Data");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(labelData), "Counter Labels Data");

    // Raw Logs
    const eventLogData = events.map(e => ({
        Timestamp: new Date(e.timestamp).toLocaleString(),
        Type: e.event_type,
        Flow: e.flow_type,
        Delta: e.delta,
        CounterLabel: e.counter_label_id || '-',
        Clicr: clicrs.find(c => c.id === e.clicr_id)?.name || e.clicr_id,
        User: e.user_id
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eventLogData), "Raw Event Log");

    const scanLogData = scans.map(s => ({
        Timestamp: new Date(s.timestamp).toLocaleString(),
        Result: s.scan_result,
        Age: s.age,
        Sex: s.sex,
        Zip: s.zip_code
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scanLogData), "Raw ID Scans");

    // Write
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob, `${filename}.xlsx`);
};

export const exportToCSV = (data: Record<string, unknown>[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${filename}.csv`);
};
