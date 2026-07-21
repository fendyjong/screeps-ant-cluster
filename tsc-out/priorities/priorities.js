export var Priority;
(function (Priority) {
    Priority[Priority["Critical"] = 0] = "Critical";
    Priority[Priority["High"] = 1] = "High";
    Priority[Priority["NormalHigh"] = 2] = "NormalHigh";
    Priority[Priority["Normal"] = 3] = "Normal";
    Priority[Priority["NormalLow"] = 4] = "NormalLow";
    Priority[Priority["Low"] = 5] = "Low";
})(Priority || (Priority = {}));
export function blankPriorityQueue() {
    const queue = {};
    for (const priority in Priority) {
        queue[priority] = [];
    }
    return queue;
}
