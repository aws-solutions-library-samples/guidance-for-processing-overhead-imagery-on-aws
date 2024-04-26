#!/bin/sh
#
# Copyright 2024 Amazon.com, Inc. or its affiliates.
#

echo "________                           .__       .__     __     _____  .____      ";                    
echo "\_____  \___  __ ___________  _____|__| ____ |  |___/  |_  /     \ |    |     ";                   
echo " /   |   \  \/ // __ \_  __ \/  ___/  |/ ___\|  |  \   __\/  \ /  \|    |     ";                  
echo "/    |    \   /\  ___/|  | \/\___ \|  / /_/  >   Y  \  | /    Y    \    |___  ";                 
echo "\_______  /\_/  \___  >__|  /____  >__\___  /|___|  /__| \____|__  /_______ \ ";                
echo "        \/          \/           \/  /_____/      \/             \/        \/ ";

echo "________                   __                          _________ __                 __            ";
echo "\______ \   ____   _______/  |________  ____ ___.__.  /   _____//  |______    ____ |  | __  ______";
echo " |    |  \_/ __ \ /  ___/\   __\_  __ \/  _ <   |  |  \_____  \\   __\__  \ _/ ___\|  |/ / /  ___/";
echo " |    /   \  ___/ \___ \  |  |  |  | \(  <_> )___  |  /        \|  |  / __ \\  \___|    <  \___ \ ";
echo "/_______  /\___  >____  > |__|  |__|   \____// ____| /_______  /|__| (____  /\___  >__|_ \/____  >";
echo "        \/     \/     \/                     \/              \/           \/     \/     \/     \/ ";

# Check if the user provided an argument
if [ -z "$1" ]; then
    echo "Usage: $0 <full|minimal>"
    exit 1
fi

if [ "$1" == "full" ]; then
    echo "Executing full destroy action..."

    cdk destroy --all --force

    echo "Full action completed."
    exit 0
fi

if [ "$1" == "minimal" ]; then
    echo "Executing minimal action..."
    
    # Run the 'cdk list' command and output to a text file
    cdk list | sort -r > stack_list.txt
    
    # Check each line in the text file
    while IFS= read -r line; do
        if [[ "$line" == *"-TSDataplane"* || "$line" == *"-MRMonitoring"* || "$line" == *"-MRModelEndpoints"* || "$line" == *"-MRAutoscaling"* || "$line" == *"-MRDataplane"* ]]; then
            stack_name=$(echo "$line" | cut -d' ' -f1)
            echo "Destroying stack $stack_name..."

            cdk destroy "$stack_name" --force || exit 1
            
            echo "Stack $stack_name destroyed."
        fi
    done < stack_list.txt
    
    echo "Minimal action completed."
    exit 0
fi

# If the argument is neither "full" nor "minimal"
echo "Invalid argument. Please provide 'full' or 'minimal'."
exit 1
