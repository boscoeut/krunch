import { useEffect, useRef } from 'react';

function useInterval(callback: any, delay: number) {
    const savedCallback: any = useRef();

    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    useEffect(() => {
        function tick() {
            if (savedCallback?.current) {
                savedCallback.current();
            }
        }
        if (delay !== null) {
            let id = setInterval(tick, delay);
            return () => clearInterval(id);
        }
    }, [delay]);
}

function useActiveTabEvent(callback: any, delay: number) {
    useInterval(() => {
        if (!document.hidden) {
            callback();
        }
    }, delay);
}

export default useActiveTabEvent;