import { sleep } from "./mangoUtils";
import { authorize, getBotRunDetails, updateBotRunDetails } from './googleUtils';
import { checkBalances } from "./getWalletBalances";
import { getMangoData } from './mangoBalances';

(async () => {
    const { google } = require('googleapis');

    const googleClient: any = await authorize();
    const googleSheets = google.sheets({ version: 'v4', auth: googleClient });
    while (true) {
        try {
            const [lastUpdate,lastConfirmed] = await getBotRunDetails(googleSheets);
            console.log("RUNNING BOTS", lastUpdate,lastConfirmed)
            if (lastConfirmed !== lastUpdate){

                await Promise.all([
                    checkBalances(),
                    // updateDrift(),
                    getMangoData(true, false, false, false)
                ])                
                console.log("UPDATING BOTS")
                await updateBotRunDetails(googleSheets, lastUpdate)
                
            }
        } catch (error) {
            console.log(error);
        }finally{
            await sleep(0.2 * 1000 * 60)
        }
    }
})();
