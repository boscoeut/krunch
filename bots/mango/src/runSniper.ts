import { doubleSwapLoop } from "./sniper";

(async () => {
    try {
        const shouldUpdateDrift = false;
        await doubleSwapLoop(true, false, false, shouldUpdateDrift);
    } catch (error) {
        console.log(error);
    }
})();