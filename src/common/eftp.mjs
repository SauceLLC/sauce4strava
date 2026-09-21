
export function fitMorton(mmp) {
    // mmp = [{duration: seconds, power: watts}, ...]

    // Initial ranges.
    let best = null;

    // k must be smaller than the shortest duration we're fitting.
    const minDuration = Math.min(...mmp.map(p => p.duration));

    // Search k from 0 up to 90% of the shortest duration.
    // 1-second resolution is plenty for k.
    for (let k = 0; k <= minDuration * 0.9; k += 1) {
        // For a fixed k:
        //
        // P = CP + W' / (t - k)
        //
        // This is linear in CP and W', so solve those two
        // parameters with ordinary least squares.

        let n = 0;
        let sx = 0;
        let sy = 0;
        let sxx = 0;
        let sxy = 0;

        for (const {duration: t, power: p} of mmp) {
            const x = 1 / (t - k);

            n++;
            sx += x;
            sy += p;
            sxx += x * x;
            sxy += x * p;
        }

        const denominator = n * sxx - sx * sx;

        if (Math.abs(denominator) < 1e-12) {
            continue;
        }

        const WPrime =
            (n * sxy - sx * sy) / denominator;

        const CP =
            (sy - WPrime * sx) / n;

        // Calculate sum of squared errors.
        let error = 0;

        for (const {duration: t, power: p} of mmp) {
            const predicted =
                CP + WPrime / (t - k);

            const residual = predicted - p;

            error += residual * residual;
        }

        if (best === null || error < best.error) {
            best = {
                CP,
                WPrime,
                k,
                error,
            };
        }
    }

    return best;
}


export function powerAtMorton(seconds, model) {
    return model.CP + model.WPrime / (seconds - model.k);
}

export function powerAtMorton2(seconds, model) {
    return model.CP + model.AWC / (seconds + model.tau);
}

export function powerAtMorton3(seconds, model) {
    return model.CP + model.WPrime / (seconds + model.tau);
}

export function powerAtMorton4(t, model) {
    const delta = model.pMax - model.CP;
    if (!(delta > 0)) {
        return NaN;
    }
    return model.CP + model.wPrime / (t + model.wPrime / delta);
}


export function fitMorton3(mmp) {
    if (mmp.length < 3) {
        throw new Error("Morton 3-parameter fit requires at least 3 mmp");
    }

    // Sort by duration.
    mmp = [...mmp].sort((a, b) => a.duration - b.duration);

    for (const p of mmp) {
        if (!(p.duration > 0) || !Number.isFinite(p.power)) {
            throw new Error("Invalid power-duration point");
        }
    }

    const minT = mmp[0].duration;
    const maxT = mmp[mmp.length - 1].duration;

    /*
     * For a fixed tau:
     *
     *   P_i = CP + W' * x_i
     *
     * where:
     *
     *   x_i = 1 / (t_i + tau)
     *
     * So CP and W' are just a 2-parameter linear least-squares fit.
     */
    function fitForTau(tau) {
        let n = 0;
        let sx = 0;
        let sy = 0;
        let sxx = 0;
        let sxy = 0;

        for (const {duration: t, power: p} of mmp) {
            const x = 1 / (t + tau);

            n++;
            sx += x;
            sy += p;
            sxx += x * x;
            sxy += x * p;
        }

        const denom = n * sxx - sx * sx;

        if (Math.abs(denom) < 1e-30) {
            return null;
        }

        const WPrime = (n * sxy - sx * sy) / denom;
        const CP = (sy - WPrime * sx) / n;

        if (!(WPrime > 0) || !Number.isFinite(CP)) {
            return null;
        }

        const Pmax = CP + WPrime / tau;

        /*
         * Physical constraints:
         *
         * CP should be below every observed power.
         * Pmax should be above every observed power.
         */
        let maxObserved = -Infinity;
        let minObserved = Infinity;

        for (const p of mmp) {
            minObserved = Math.min(minObserved, p.power);
            maxObserved = Math.max(maxObserved, p.power);
        }

        if (CP >= minObserved || Pmax <= maxObserved) {
            //return null;
        }

        let sse = 0;

        for (const {duration: t, power: p} of mmp) {
            const predicted = CP + WPrime / (t + tau);
            const error = predicted - p;
            sse += error * error;
        }

        return {
            CP,
            WPrime,
            Pmax,
            tau,
            sse,
        };
    }

    /*
     * Search tau over a logarithmic range.
     *
     * tau is measured in seconds.
     *
     * The useful range can span orders of magnitude, so a
     * logarithmic search is much better than a linear search.
     */
    const tauMin = 0.01;
    const tauMax = Math.max(
        minT * 100,
        maxT * 10
    );

    let best = null;

    const coarseSteps = 300;

    for (let i = 0; i < coarseSteps; i++) {
        const f = i / (coarseSteps - 1);

        const tau =
            tauMin *
            Math.pow(tauMax / tauMin, f);

        const result = fitForTau(tau);

        if (result && (!best || result.sse < best.sse)) {
            best = result;
        }
    }

    if (!best) {
        throw new Error("Unable to find a valid Morton fit");
    }

    /*
     * Refine around the best coarse value using a golden-section
     * search on log(tau).
     */
    const bestLogTau = Math.log(best.tau);

    // Coarse grid spacing in log space.
    const logMin = Math.log(tauMin);
    const logMax = Math.log(tauMax);
    const step = (logMax - logMin) / (coarseSteps - 1);

    let lo = bestLogTau - step;
    let hi = bestLogTau + step;

    lo = Math.max(lo, logMin);
    hi = Math.min(hi, logMax);

    const phi = (1 + Math.sqrt(5)) / 2;

    let x1 = hi - (hi - lo) / phi;
    let x2 = lo + (hi - lo) / phi;

    let f1 = fitForTau(Math.exp(x1));
    let f2 = fitForTau(Math.exp(x2));

    for (let i = 0; i < 100; i++) {
        const sse1 = f1 ? f1.sse : Infinity;
        const sse2 = f2 ? f2.sse : Infinity;

        if (sse1 < sse2) {
            hi = x2;
            x2 = x1;
            f2 = f1;

            x1 = hi - (hi - lo) / phi;
            f1 = fitForTau(Math.exp(x1));
        } else {
            lo = x1;
            x1 = x2;
            f1 = f2;

            x2 = lo + (hi - lo) / phi;
            f2 = fitForTau(Math.exp(x2));
        }
    }

    const refined1 = fitForTau(Math.exp(x1));
    const refined2 = fitForTau(Math.exp(x2));

    for (const result of [best, refined1, refined2]) {
        if (result && result.sse < best.sse) {
            best = result;
        }
    }

    return {
        ...best,

        // Morton's original k is negative.
        k: -best.tau,

        // Useful derived quantity.
        rmse: Math.sqrt(best.sse / mmp.length),
    };
}


export function fitMorton2(mmp) {
    let best = null;

    const minDuration = Math.min(
        ...mmp.map(p => p.duration)
    );

    /*
     * tau = -k
     *
     * Morton's k is negative, so tau is positive.
     *
     * For a given tau:
     *
     *   P = CP + AWC / (t + tau)
     *
     * This is linear in CP and AWC.
     */

    // Search tau.
    //
    // This range can be made more sophisticated later,
    // but covers the useful range for cycling data.
    const maxTau = minDuration * 10;

    for (let tau = 0; tau <= maxTau; tau += 1) {
        let n = 0;
        let sx = 0;
        let sy = 0;
        let sxx = 0;
        let sxy = 0;

        for (const {duration: t, power: p} of mmp) {
            const x = 1 / (t + tau);

            n++;
            sx += x;
            sy += p;
            sxx += x * x;
            sxy += x * p;
        }

        const denominator =
            n * sxx - sx * sx;

        if (Math.abs(denominator) < 1e-12) {
            continue;
        }

        const AWC =
            (n * sxy - sx * sy) /
            denominator;

        const CP =
            (sy - AWC * sx) / n;

        // Physical constraints.
        if (AWC <= 0 || CP <= 0) {
            continue;
        }

        let error = 0;

        for (const {duration: t, power: p} of mmp) {
            const predicted =
                CP + AWC / (t + tau);

            const residual =
                predicted - p;

            error += residual * residual;
        }

        if (best === null || error < best.error) {
            best = {
                CP,
                AWC,
                k: -tau,
                tau,
                error,
            };
        }
    }

    return best;
}

/**
 * GoldenCheetah-style CP3 / Morton 3-parameter model.
 *
 * Model:
 *
 *   P(t) = CP + W' / (t - W' / (CP - Pmax))
 *
 * which is equivalently:
 *
 *   P(t) = CP + W' / (t + W' / (Pmax - CP))
 *
 * t      = duration in seconds
 * CP     = critical power, watts
 * WPrime = W', joules
 * Pmax   = maximum power parameter, watts
 *
 * points:
 *   [{ duration: seconds, power: watts }, ...]
 *
 * Fit is unweighted least squares using Levenberg-Marquardt.
 */
export function fitMorton4(points, {
    initialCP = null,
    initialWPrime = 18000,
    initialPmax = null,
    maxIterations = 1000,
} = {}) {
    if (points.length < 3) {
        throw new Error("CP3 requires at least 3 points");
    }

    points = [...points]
        .filter(p =>
            Number.isFinite(p.duration) &&
            Number.isFinite(p.power) &&
            p.duration > 0
        )
        .sort((a, b) => a.duration - b.duration);

    if (points.length < 3) {
        throw new Error("Not enough valid points");
    }

    const maxPower = Math.max(...points.map(p => p.power));
    const minPower = Math.min(...points.map(p => p.power));

    // Reasonable starting values.
    //
    // GC's example uses roughly:
    //   cp = 200
    //   W  = 11000
    //   pmax = 1000
    //
    // But using the actual data for initialization is much
    // more useful for arbitrary athletes.
    let cp = initialCP ?? points.at(-1).power * 0.90;
    let wPrime = initialWPrime;
    let pmax = initialPmax ?? Math.max(1000, maxPower * 1.10);

    if (!(wPrime > 0)) {
        throw new Error("Initial W' must be positive");
    }

    if (!(pmax > cp)) {
        pmax = Math.max(cp + 100, maxPower * 1.10);
    }

    /*
     * Evaluate the model.
     */
    function predict(t, cp, wPrime, pmax) {
        const delta = pmax - cp;

        if (!(delta > 0)) {
            return NaN;
        }

        const denominator =
            t + wPrime / delta;

        return cp + wPrime / denominator;
    }

    /*
     * Analytic derivatives of P(t).
     *
     * Let:
     *
     *   d = pmax - cp
     *   D = t + W'/d
     *
     * Then:
     *
     *   dP/dCP    = 1 - (W'/(dD))^2
     *   dP/dW'    = t / D^2
     *   dP/dPmax  =     (W'/(dD))^2
     */
    function derivatives(t, cp, wPrime, pmax) {
        const delta = pmax - cp;
        const D = t + wPrime / delta;

        const a = wPrime / (delta * D);
        const a2 = a * a;

        return [
            1 - a2,
            t / (D * D),
            a2,
        ];
    }

    /*
     * We scale W' internally because CP/pMax are hundreds
     * of watts while W' is thousands of joules.
     *
     * Internal parameters:
     *
     *   p[0] = CP
     *   p[1] = W' / 1000
     *   p[2] = Pmax
     */
    let p = [
        cp,
        wPrime / 1000,
        pmax,
    ];

    function unpack(p) {
        return {
            CP: p[0],
            wPrime: p[1] * 1000,
            pmax: p[2],
        };
    }

    function evaluate(p) {
        const {CP, wPrime, pmax} = unpack(p);

        if (!(wPrime > 0) || !(pmax > CP)) {
            return null;
        }

        let sse = 0;

        for (const point of points) {
            const y = predict(
                point.duration,
                CP,
                wPrime,
                pmax,
            );

            if (!Number.isFinite(y)) {
                return null;
            }

            const r = point.power - y;
            sse += r * r;
        }

        return sse;
    }

    /*
     * Solve a symmetric 3x3 system:
     *
     *   A * x = b
     *
     * with Gaussian elimination and partial pivoting.
     */
    function solve3x3(A, b) {
        const m = [
            [A[0][0], A[0][1], A[0][2], b[0]],
            [A[1][0], A[1][1], A[1][2], b[1]],
            [A[2][0], A[2][1], A[2][2], b[2]],
        ];

        for (let col = 0; col < 3; col++) {
            let pivot = col;

            for (let row = col + 1; row < 3; row++) {
                if (
                    Math.abs(m[row][col]) >
                    Math.abs(m[pivot][col])
                ) {
                    pivot = row;
                }
            }

            if (Math.abs(m[pivot][col]) < 1e-20) {
                return null;
            }

            [m[col], m[pivot]] =
                [m[pivot], m[col]];

            for (let row = col + 1; row < 3; row++) {
                const factor =
                    m[row][col] / m[col][col];

                for (let j = col; j < 4; j++) {
                    m[row][j] -=
                        factor * m[col][j];
                }
            }
        }

        const x = new Array(3);

        for (let row = 2; row >= 0; row--) {
            let sum = m[row][3];

            for (let col = row + 1; col < 3; col++) {
                sum -=
                    m[row][col] * x[col];
            }

            x[row] =
                sum / m[row][row];
        }

        return x;
    }

    let lambda = 1e-3;
    let currentError = evaluate(p);

    if (!Number.isFinite(currentError)) {
        throw new Error("Initial CP3 parameters are invalid");
    }

    let iterations = 0;

    for (; iterations < maxIterations; iterations++) {
        const JTJ = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
        ];

        const JTr = [0, 0, 0];

        const {CP, wPrime, pmax} = unpack(p);

        for (const point of points) {
            const predicted = predict(
                point.duration,
                CP,
                wPrime,
                pmax,
            );

            const residual =
                point.power - predicted;

            const d = derivatives(
                point.duration,
                CP,
                wPrime,
                pmax,
            );

            // Convert derivative wrt W' to derivative wrt
            // internal parameter W'/1000.
            d[1] *= 1000;

            for (let i = 0; i < 3; i++) {
                JTr[i] += d[i] * residual;

                for (let j = 0; j < 3; j++) {
                    JTJ[i][j] += d[i] * d[j];
                }
            }
        }

        // Levenberg-Marquardt damping.
        const A = [
            [...JTJ[0]],
            [...JTJ[1]],
            [...JTJ[2]],
        ];

        A[0][0] += lambda * Math.max(JTJ[0][0], 1);
        A[1][1] += lambda * Math.max(JTJ[1][1], 1);
        A[2][2] += lambda * Math.max(JTJ[2][2], 1);

        const step = solve3x3(A, JTr);

        if (!step) {
            break;
        }

        const candidate = [
            p[0] + step[0],
            p[1] + step[1],
            p[2] + step[2],
        ];

        const candidateError =
            evaluate(candidate);

        if (
            candidateError !== null &&
            candidateError < currentError
        ) {
            const improvement =
                currentError - candidateError;

            p = candidate;
            currentError = candidateError;

            lambda = Math.max(
                lambda / 10,
                1e-15
            );

            if (improvement < 1e-12) {
                break;
            }

            if (
                Math.max(
                    Math.abs(step[0]),
                    Math.abs(step[1] * 1000),
                    Math.abs(step[2]),
                ) < 1e-8
            ) {
                break;
            }
        } else {
            lambda *= 10;

            if (lambda > 1e30) {
                break;
            }
        }
    }

    const result = unpack(p);

    return {
        CP: result.CP,
        wPrime: result.wPrime,
        pMax: result.pmax,
        rmse: Math.sqrt(currentError / points.length),
        sse: currentError,
        iterations,
    };
}


export function fitMorton5(points) {
    points = points
        .filter(p =>
            Number.isFinite(p.duration) &&
            Number.isFinite(p.power) &&
            p.duration > 0
        )
        .sort((a, b) => a.duration - b.duration);

    if (points.length < 3) {
        throw new Error('Need at least 3 points');
    }

    const pMin = Math.min(...points.map(p => p.power));
    const pMaxObserved = Math.max(...points.map(p => p.power));

    /*
     * For fixed CP and tau:
     *
     *     P = CP + W / (t + tau)
     *
     * W is linear, so solve it exactly.
     */
    function fitFor(cp, tau) {
        let numerator = 0;
        let denominator = 0;

        for (const {duration: t, power: p} of points) {
            const x = 1 / (t + tau);
            const y = p - cp;

            numerator += x * y;
            denominator += x * x;
        }

        if (denominator === 0) {
            return null;
        }

        const wPrime = numerator / denominator;

        if (!(wPrime > 0)) {
            return null;
        }

        const pMax =
            cp + wPrime / tau;

        if (!(pMax > pMaxObserved)) {
            return null;
        }

        let sse = 0;

        for (const {duration: t, power: p} of points) {
            const predicted =
                cp + wPrime / (t + tau);

            const error =
                predicted - p;

            sse += error * error;
        }

        return {
            cp,
            wPrime,
            pMax,
            tau,
            sse,
        };
    }

    /*
     * Global coarse search.
     *
     * CP should be below the lowest observed power.
     * tau is searched logarithmically because its useful scale
     * can span orders of magnitude.
     */
    let best = null;

    const cpHigh = pMin - 0.01;
    const cpLow = Math.max(1, pMin * 0.5);

    const tauMin = 0.1;
    const tauMax = 100000;

    const cpSteps = 250;
    const tauSteps = 250;

    for (let i = 0; i < cpSteps; i++) {
        const cp =
            cpLow +
            (cpHigh - cpLow) *
            i / (cpSteps - 1);

        for (let j = 0; j < tauSteps; j++) {
            const f =
                j / (tauSteps - 1);

            const tau =
                tauMin *
                Math.pow(tauMax / tauMin, f);

            const result = fitFor(cp, tau);

            if (
                result &&
                (!best || result.sse < best.sse)
            ) {
                best = result;
            }
        }
    }

    if (!best) {
        throw new Error(
            'Could not find a valid Morton 3P fit'
        );
    }

    /*
     * Refine the neighborhood of the best result.
     *
     * Search CP and log(tau) locally.
     */
    let cpCenter = best.cp;
    let logTauCenter = Math.log(best.tau);

    let cpRange =
        Math.max(1, (cpHigh - cpLow) / cpSteps);

    let logTauRange =
        Math.log(tauMax / tauMin) / tauSteps;

    for (let pass = 0; pass < 6; pass++) {
        let localBest = best;

        const cpStep =
            cpRange / 10;

        const tauStep =
            logTauRange / 10;

        for (let i = -10; i <= 10; i++) {
            const cp =
                cpCenter + i * cpStep;

            if (cp <= 0 || cp >= cpHigh) {
                continue;
            }

            for (let j = -10; j <= 10; j++) {
                const logTau =
                    logTauCenter + j * tauStep;

                const tau =
                    Math.exp(logTau);

                const result =
                    fitFor(cp, tau);

                if (
                    result &&
                    result.sse < localBest.sse
                ) {
                    localBest = result;
                }
            }
        }

        best = localBest;

        cpCenter = best.cp;
        logTauCenter = Math.log(best.tau);

        cpRange /= 10;
        logTauRange /= 10;
    }

    return {
        cp: best.cp,
        wPrime: best.wPrime,
        pMax: best.pMax,
        tau: best.tau,
        rmse: Math.sqrt(best.sse / points.length),
    };
}


export function morton3(t, m) {
    return m.cp +
        m.wPrime /
        (t + m.tau);
}

