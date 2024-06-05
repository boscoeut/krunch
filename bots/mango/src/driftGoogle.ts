import { updateDrift } from './sniper';

(async () => {
    try {
        await updateDrift()
    } catch (error) {
        console.log(error);
    }
})();
