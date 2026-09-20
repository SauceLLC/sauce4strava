/* global addTests, sauce, assertEqual, assertEqualArray */

addTests([
    function test_model_weight_before_history() {
        const athlete = {weightHistory: [{ts: 30, value: 75}, {ts: 10, value: 70}, {ts: 20, value: 72}]};
        assertEqual(sauce.model.getAthleteWeightAt(athlete, 5), 70);
    },
    function test_model_weight_history_boundaries() {
        const athlete = {weightHistory: [{ts: 30, value: 75}, {ts: 10, value: 70}, {ts: 20, value: 72}]};
        for (const [ts, weight] of [[10, 70], [19, 70], [20, 72], [29, 72], [30, 75], [40, 75]]) {
            assertEqual(sauce.model.getAthleteWeightAt(athlete, ts), weight);
        }
    },
    function test_model_weight_empty_history() {
        for (const athlete of [{}, {weightHistory: []}]) {
            assertEqual(sauce.model.getAthleteWeightAt(athlete, 5), undefined);
        }
    },
    function test_model_weight_history_is_not_sorted_in_place() {
        const history = Object.freeze([{ts: 20, value: 72}, {ts: 30, value: 75}, {ts: 10, value: 70}]);
        assertEqual(sauce.model.getAthleteWeightAt({weightHistory: history}, 5), 70);
        assertEqualArray(history.map(x => x.ts), [20, 30, 10]);
    },
    function test_model_weight_undated_history() {
        const athlete = {weightHistory: [{ts: 20, value: 72}, {value: 70}]};
        assertEqual(sauce.model.getAthleteWeightAt(athlete, 5), 70);
        assertEqual(sauce.model.getAthleteWeightAt(athlete, 20), 72);
    },
    function test_model_ftp_before_history_respects_sport() {
        const athlete = {ftpHistory: [
            {ts: 10, value: 300, type: 'run'},
            {ts: 30, value: 275, type: 'ride'},
            {ts: 20, value: 250, type: 'ride'},
        ]};
        assertEqual(sauce.model.getAthleteFTPAt(athlete, 5, 'ride'), 250);
        assertEqual(sauce.model.getAthleteFTPAt(athlete, 5, 'run'), 300);
        assertEqual(sauce.model.getAthleteFTPAt(athlete, 5, 'swim'), undefined);
        assertEqual(sauce.model.getAthleteFTPAt(athlete, 30, 'ride'), 275);
    },
    function test_model_ftp_generic_history() {
        const athlete = {ftpHistory: [
            {ts: 20, value: 250, type: 'ride'},
            {ts: 10, value: 200},
        ]};
        assertEqual(sauce.model.getAthleteFTPAt(athlete, 5, 'ride'), 200);
        assertEqual(sauce.model.getAthleteFTPAt(athlete, 20, 'ride'), 250);
        assertEqual(sauce.model.getAthleteFTPAt(athlete, 20, 'run'), 200);
        assertEqual(sauce.model.getAthleteFTPAt({}, 5, 'ride'), undefined);
    },
    function test_model_history_preserves_zero_values() {
        const athlete = {ftpHistory: [{ts: 20, value: 250}, {ts: 10, value: 0}]};
        assertEqual(sauce.model.getAthleteFTPAt(athlete, 5, 'ride'), 0);
    },
]);
