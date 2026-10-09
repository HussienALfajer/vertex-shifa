// Child process: books offline, then dies without closing anything (simulated power cut).
import { openDevice } from '../client/device.mjs';
import { IDS } from '../server/seed.mjs';

const [dir, hexKey] = process.argv.slice(2);
const device = await openDevice({ name: 'crash', deviceId: IDS.deviceCrash, userId: IDS.user, dir, hexKey });
await device.start();
device.goOffline();
const booked = await device.book({ slotId: IDS.slotReception3, patientId: IDS.patients[0], patientPresent: true });
process.stdout.write(`${JSON.stringify(booked)}\n`, () => process.kill(process.pid, 'SIGKILL'));
