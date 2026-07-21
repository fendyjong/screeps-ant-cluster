import { USE_SCREEPS_PROFILER } from '../~settings';
import profiler from './screeps-profiler';
export function profile(target, key, _descriptor) {
    if (!USE_SCREEPS_PROFILER) {
        return;
    }
    if (key) {
        // case of method decorator
        profiler.registerFN(target, key);
        return;
    }
    // case of class decorator
    const ctor = target;
    if (!ctor.prototype) {
        return;
    }
    const className = ctor.name;
    profiler.registerClass(target, className);
}
