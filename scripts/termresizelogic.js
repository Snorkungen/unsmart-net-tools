
function log_matrix(rows) {
    console.log(`[\n${rows.reduce((s, v) => s += "\t[" + v.join(", ") + "]\n", "")}]`)
}

const state = {
    rows: [
        [1, 2, 3, 4, 5, 6, 7],
        [7, 6, 5, 4, 3, 2, 1],
    ],
    width: 7,
    markers: {}
}


function resize(state) {
    for (let y = 0; y < state.rows.length; y++) {
        let sy = y;

        if (state.rows[sy].length <= state.width) {
            // using markers try to recover some stuff ...
            let start = state.rows[sy].length;
            state.rows[sy].length = state.width;

            if (state.markers[y]) {
                let [end, rc] = state.markers[y];

                outer: for (let i = 1; i <= rc; i++) {
                    while (state.rows[sy + i].length) {
                        state.rows[sy][start++] = state.rows[sy + i].shift()

                        if (start > end || start >= state.rows[sy].length) {
                            break outer;
                        }
                    }
                }

                // remove the succesive rows
                let remove_count = 0;
                for (let i = (sy + rc); i > sy; i--) {
                    if (state.rows[i].length == 0 || state.rows[i][0] == 0) {
                        remove_count++;
                        state.rows.splice(i, 1);
                        // resolve all the markers for the succesive markers
                    } else {
                        break
                    }
                }

                // consume the markers ..
                if (remove_count == rc) {
                    delete state.markers[sy];
                }

                // NOTE: the following logic relies upon the keys appering in an ascending order
                for (let key in state.markers) {
                    // let's hope this is sorted
                    state.markers[parseInt(key) - remove_count] = state.markers[key];
                    delete state.markers[key]
                }
            }

            for (let i = start; i < state.rows[sy].length; i++) {
                state.rows[sy][i] = 0;
            }

            continue;
        }

        let end = state.rows[sy].length - 1;
        for (; state.rows[sy][end] == 0 && end > 0; end--) { }

        if (end < state.width) {
            state.rows[sy].length = state.width;
            continue
        }

        if (state.markers[sy]) {
            let [tot, rc] = state.markers[sy];
            let start = state.rows[sy].length;
            state.rows[sy].length = tot + 1;
            end = tot;

            outer: for (let i = 1; i <= rc; i++) {
                while (state.rows[sy + i].length) {
                    state.rows[sy][start++] = state.rows[sy + i].shift()

                    if (start > end || start >= state.rows[sy].length) {
                        break outer;
                    }
                }
            }

            // remove the succesive rows
            state.rows.splice(sy + 1, rc);
            delete state.markers[sy];

            let increment_by = Math.ceil((tot + 1) / state.width) - rc - 1;
            if (increment_by > 0) {
                // NOTE: the following logic relies upon the keys appering in an ascending order
                for (let key in state.markers) {
                    // let's hope this is sorted
                    if (parseInt(key) <= sy) break;
                    state.markers[parseInt(key) + increment_by] = state.markers[key];
                    delete state.markers[key]
                }
            }
        }

        let nrow = new Array(state.width);
        for (let i = state.width; i <= end; i++) {
            if (i > state.width && (i % state.width) == 0) {
                y += 1
                state.rows.splice(y, 0, nrow);
                nrow = new Array(state.width);
            }

            nrow[i % state.width] = state.rows[sy][i];
        }

        y += 1
        state.rows.splice(y, 0, nrow);
        state.markers[sy] = [end, y - sy];

        for (let i = end % state.width + 1; i < state.width; i++) {
            state.rows[y][i] = 0;
        }

        state.rows[sy].length = state.width;
    }

    // do the logic thing that reduces the size
    return state
}

log_matrix(resize(state).rows)
state.width = 5
log_matrix(resize(state).rows)
state.width = 10
log_matrix(resize(state).rows)
state.width = 6
log_matrix(resize(state).rows)
state.width = 5
log_matrix(resize(state).rows)
state.width = 4
log_matrix(resize(state).rows)
state.width = 2
log_matrix(resize(state).rows)
state.width = 9
log_matrix(resize(state).rows)
console.log(state)