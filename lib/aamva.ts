export type ParsedID = {
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null; // YYYYMMDD
    sex: 'M' | 'F' | null;
    postalCode: string | null;
    expirationDate: string | null; // YYYYMMDD
    age: number | null;
    isExpired: boolean;
    // Enhanced Fields
    addressStreet: string | null;
    city: string | null;
    state: string | null;
    eyeColor: string | null;
    hairColor: string | null;
    height: string | null;
    weight: string | null;
    idNumber: string | null;
};

export function parseAAMVA(data: string): ParsedID {
    const getVal = (code: string) => {
        // Find code (e.g. DAJ), optional colon/space, then capture until newline or end
        const regex = new RegExp(`${code}[:\\s]*(.*?)(?:\\n|\\r|$)`, 'i');
        const match = data.match(regex);
        return match ? match[1].trim() : null;
    };

    // Extract raw fields
    const firstName = getVal('DAC') || getVal('DCT');
    const lastName = getVal('DCS') || getVal('DAB');

    // ... DOB Logic ...
    let dobRaw = getVal('DBB') || getVal('DBL'); // DBL is sometimes used
    let dob: string | null = null;
    let age: number | null = null;

    if (dobRaw) {
        dobRaw = dobRaw.replace(/[^0-9]/g, '');
        if (dobRaw.length === 8) {
            const y1 = parseInt(dobRaw.substring(0, 4));
            if (y1 > 1900 && y1 < 2100) {
                dob = dobRaw; // YYYYMMDD
            } else {
                const mm = dobRaw.substring(0, 2);
                const dd = dobRaw.substring(2, 4);
                const yyyy = dobRaw.substring(4, 8);
                dob = `${yyyy}${mm}${dd}`;
            }
        }
    }

    if (dob) {
        const y = parseInt(dob.substring(0, 4));
        const m = parseInt(dob.substring(4, 6)) - 1;
        const d = parseInt(dob.substring(6, 8));
        const birthDate = new Date(y, m, d);
        const today = new Date();

        let ageCalc = today.getFullYear() - birthDate.getFullYear();
        const mDiff = today.getMonth() - birthDate.getMonth();
        if (mDiff < 0 || (mDiff === 0 && today.getDate() < birthDate.getDate())) {
            ageCalc--;
        }
        age = ageCalc;
    }

    const sexRaw = getVal('DBC');
    let sex: 'M' | 'F' | null = null;
    if (sexRaw === '1' || sexRaw === 'M') sex = 'M';
    if (sexRaw === '2' || sexRaw === 'F') sex = 'F';

    // Address
    const addressStreet = getVal('DAG');
    const city = getVal('DAI');
    const state = getVal('DAJ');

    // Postal Code: DAK usually 5 or 9 digit
    let postalCode = getVal('DAK');
    if (postalCode) {
        postalCode = postalCode.substring(0, 5);
    }

    // Physical Attributes
    const eyeColor = getVal('DAY');
    const hairColor = getVal('DAZ');
    const height = getVal('DAU');
    const weight = getVal('DAW');

    // ID Number
    const idNumber = getVal('DAQ');

    // Expiration — handle both YYYYMMDD and MMDDYYYY formats (same as DOB)
    let expRaw = getVal('DBA');
    let expNormalized: string | null = null;
    let isExpired = false;
    if (expRaw) {
        expRaw = expRaw.replace(/[^0-9]/g, '');
        if (expRaw.length === 8) {
            const y1 = parseInt(expRaw.substring(0, 4));
            if (y1 > 1900 && y1 < 2100) {
                expNormalized = expRaw; // YYYYMMDD
            } else {
                const mm = expRaw.substring(0, 2);
                const dd = expRaw.substring(2, 4);
                const yyyy = expRaw.substring(4, 8);
                expNormalized = `${yyyy}${mm}${dd}`;
            }
            const y = parseInt(expNormalized.substring(0, 4));
            const m = parseInt(expNormalized.substring(4, 6)) - 1;
            const d = parseInt(expNormalized.substring(6, 8));
            const expDate = new Date(y, m, d);
            if (expDate < new Date()) {
                isExpired = true;
            }
        }
    }

    return {
        firstName,
        lastName,
        dateOfBirth: dob,
        sex,
        postalCode,
        expirationDate: expNormalized,
        age,
        isExpired,
        addressStreet,
        city,
        state,
        eyeColor,
        hairColor,
        height,
        weight,
        idNumber
    };
}
