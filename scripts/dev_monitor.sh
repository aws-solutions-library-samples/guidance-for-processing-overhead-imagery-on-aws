#!/bin/bash
#
# Copyright 2023 Amazon.com, Inc. or its affiliates.
#

# This is a utility script to help with parsing logs from cloudwatch and defaults to using a known log group
# for AWSOversightMLModelRunner. A user can pass in two parameters:
# $1 = group_name = log group to monitor
# $2 = time_window = window, in seconds, to filter log outputs
# $3 = region = region log group is contained in

echo "   ___                    _       _     _            __  ";
echo "  /_____   _____ _ __ ___(_) __ _| |__ | |_  /\/\   / /  ";
echo " //  /\ \ / / _ | '__/ __| |/ _\` | '_ \| __|/    \ / /   ";
echo "/ \_// \ V |  __| |  \__ | | (_| | | | | |_/ /\/\ / /___ ";
echo "\___/   \_/ \___|_|  |___|_|\__, |_| |_|\__\/    \\____/ ";
echo "  __  __                _   _                   __  __   ___     _                      ";
echo " |  \/  |  ___   _ _   (_) | |_   ___   _ _    |  \/  | | _ \   | |     ___   __ _   ___";
echo " | |\/| | / _ \ | ' \  | | |  _| / _ \ | '_|   | |\/| | |   /   | |__  / _ \ / _\` | (_-<";
echo " |_|  |_| \___/ |_||_| |_|  \__| \___/ |_|     |_|  |_| |_|_\   |____| \___/ \__, | /__/";
echo "                                                                             |___/      ";


# grab our arguments
group_name="${1:-/aws/OSML/MRService}"
time_window="${2:-5}"
region="${3:-us-west-2}"

echo "Started monitoring log group $group_name for events found starting $time_window seconds ago."

# set our start time to be 60 seconds in the past
start_time=$(( ( $(date -u +"%s") - time_window ) * 1000 ))

# start checking for events
while [[ -n "$start_time" ]]; do
    text_events=$(aws logs filter-log-events --log-group-name "$group_name" --interleaved --start-time $start_time --output text --region "$region")
    json_events=$(aws logs filter-log-events --log-group-name "$group_name" --interleaved --start-time $start_time --output json --region "$region")
    [ $? -ne 0 ] && break
    next_start_time=$( sed -nE 's/^EVENTS.([^[:blank:]]+).([[:digit:]]+).+$/\2/ p' <<< "$text_events" | tail -n1 )
    [ -n "$next_start_time" ] && start_time=$(( next_start_time + 1 ))
    # report events
    echo "$json_events"
    # wait 5 seconds
    sleep 5
done
