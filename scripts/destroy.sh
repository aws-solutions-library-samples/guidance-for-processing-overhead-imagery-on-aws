#!/bin/bash
#
# Copyright 2023-2026 Amazon.com, Inc. or its affiliates.
#
# OSML Destroy Script
# Orchestrates CDK destruction of OSML components using reverse dependency
# topological sort for optimal parallelism and safe ordering.
#

set -e

# =============================================================================
# Constants
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_CONFIG_PATH="bin/deployment.json"

# Exit codes
EXIT_SUCCESS=0
EXIT_CONFIG_ERROR=1
EXIT_CDK_ERROR=3

# Component names will be populated dynamically from config
COMPONENT_NAMES=()

# Track destruction results for summary
declare -A DESTRUCTION_RESULTS

# Component state for topological sort: pending, destroying, destroyed, failed, skipped
declare -A COMPONENT_STATE

# Track which wave each component was destroyed in
declare -A COMPONENT_WAVE

# =============================================================================
# Logging Functions
# =============================================================================

if [[ -t 1 ]]; then
    COLOR_RESET='\033[0m'
    COLOR_RED='\033[0;31m'
    COLOR_GREEN='\033[0;32m'
    COLOR_YELLOW='\033[0;33m'
    COLOR_BLUE='\033[0;34m'
    COLOR_CYAN='\033[0;36m'
else
    COLOR_RESET=''
    COLOR_RED=''
    COLOR_GREEN=''
    COLOR_YELLOW=''
    COLOR_BLUE=''
    COLOR_CYAN=''
fi

log_info() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_BLUE}[INFO]${COLOR_RESET} $*"
}

log_warn() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_YELLOW}[WARN]${COLOR_RESET} $*" >&2
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_RED}[ERROR]${COLOR_RESET} $*" >&2
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_GREEN}[SUCCESS]${COLOR_RESET} $*"
}

log_wave() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_CYAN}[WAVE]${COLOR_RESET} $*"
}

# =============================================================================
# Error Handling Functions
# =============================================================================

exit_config_error() {
    local message="$1"
    local component="${2:-}"
    if [[ -n "${component}" ]]; then
        log_error "Configuration error for ${component}: ${message}"
    else
        log_error "Configuration error: ${message}"
    fi
    exit ${EXIT_CONFIG_ERROR}
}

# =============================================================================
# Help Function
# =============================================================================
show_help() {
    cat << EOF
OSML Destroy Script

Usage: $(basename "$0") [OPTIONS] [COMPONENT...]

Options:
  -c, --config FILE       Path to config file (default: ${DEFAULT_CONFIG_PATH})
  -d, --dry-run           Show what would be destroyed without executing
  -h, --help              Show this help message

Components:
  If specified, only destroy the listed components
  Component names are read dynamically from the config file (keys with a "deploy" property)

Destruction Order:
  Components are destroyed using reverse dependency topological sort:
  - Components with no remaining dependents are destroyed first (in parallel)
  - As each component is destroyed, its dependencies become eligible
  - If a component fails, all components it depends on are skipped
  This maximizes parallelism while respecting resource dependencies.

Examples:
  $(basename "$0")                            # Destroy all deployed stacks
  $(basename "$0") osml-model-runner          # Destroy only model runner
  $(basename "$0") -d                         # Dry run - show destruction waves
  $(basename "$0") -c custom-config.json      # Use custom config file

EOF
}

# =============================================================================
# Argument Parsing
# =============================================================================
CONFIG_PATH="${DEFAULT_CONFIG_PATH}"
DRY_RUN=false
SELECTED_COMPONENTS=()

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -c|--config)
                if [[ -z "$2" || "$2" == -* ]]; then
                    log_error "Option $1 requires a file path argument"
                    exit ${EXIT_CONFIG_ERROR}
                fi
                CONFIG_PATH="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                show_help
                exit ${EXIT_SUCCESS}
                ;;
            -*)
                log_error "Unknown option: $1"
                show_help
                exit ${EXIT_CONFIG_ERROR}
                ;;
            *)
                SELECTED_COMPONENTS+=("$1")
                shift
                ;;
        esac
    done
}

# =============================================================================
# Configuration Functions
# =============================================================================
validate_config() {
    local config_file="$1"

    log_info "Validating configuration file: ${config_file}"

    if [[ ! -f "${config_file}" ]]; then
        exit_config_error "Configuration file not found: ${config_file}"
    fi

    if ! command -v jq &> /dev/null; then
        exit_config_error "jq is required but not installed. Please install jq."
    fi

    if ! jq empty "${config_file}" 2>/dev/null; then
        exit_config_error "Invalid JSON in configuration file: ${config_file}"
    fi

    log_success "Configuration validated successfully"
}

read_config() {
    local config_file="$1"
    log_info "Reading configuration from: ${config_file}"
    validate_config "${config_file}"
    CONFIG_JSON=$(cat "${config_file}")
}

get_component_deploy_flag() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq -r ".[\"${component}\"].deploy // false"
}

get_component_dependencies() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq -r ".[\"${component}\"].dependsOn // [] | .[]"
}

# Extract component names from config (keys that have a "deploy" property)
populate_component_names() {
    local components
    components=$(echo "${CONFIG_JSON}" | jq -r 'to_entries | map(select(.value.deploy != null)) | .[].key')

    COMPONENT_NAMES=()
    while IFS= read -r component; do
        if [[ -n "${component}" ]]; then
            COMPONENT_NAMES+=("${component}")
        fi
    done <<< "${components}"

    if [[ ${#COMPONENT_NAMES[@]} -eq 0 ]]; then
        exit_config_error "No components with 'deploy' property found in configuration"
    fi

    log_info "Discovered components: ${COMPONENT_NAMES[*]}"
}

# =============================================================================
# Topological Sort Functions
# =============================================================================

# Build the list of components eligible for destruction, applying filters.
# Sets COMPONENT_STATE to "pending" for each eligible component.
# Populates the DESTROY_CANDIDATES array.
DESTROY_CANDIDATES=()

build_destroy_candidates() {
    DESTROY_CANDIDATES=()

    for component in "${COMPONENT_NAMES[@]}"; do
        local deploy_flag
        deploy_flag=$(get_component_deploy_flag "${component}")

        # Skip components not marked for deploy
        if [[ "${deploy_flag}" != "true" ]]; then
            continue
        fi

        # If specific components were selected, filter
        if [[ ${#SELECTED_COMPONENTS[@]} -gt 0 ]]; then
            local selected=false
            for sel in "${SELECTED_COMPONENTS[@]}"; do
                if [[ "${sel}" == "${component}" ]]; then
                    selected=true
                    break
                fi
            done
            if [[ "${selected}" != "true" ]]; then
                continue
            fi
        fi

        DESTROY_CANDIDATES+=("${component}")
        COMPONENT_STATE["${component}"]="pending"
    done
}

# Get components that have no pending dependents and are ready to destroy.
# Populates the READY_COMPONENTS array.
READY_COMPONENTS=()

get_ready_components() {
    READY_COMPONENTS=()

    for component in "${!COMPONENT_STATE[@]}"; do
        # Only consider pending components
        if [[ "${COMPONENT_STATE[$component]}" != "pending" ]]; then
            continue
        fi

        # Check if any other pending/destroying component depends on this one
        local is_blocked=false
        for other in "${!COMPONENT_STATE[@]}"; do
            local other_state="${COMPONENT_STATE[$other]}"
            # Only active (pending/destroying) components can block us
            if [[ "${other_state}" != "pending" && "${other_state}" != "destroying" ]]; then
                continue
            fi
            if [[ "${other}" == "${component}" ]]; then
                continue
            fi

            # Check if 'other' depends on 'component'
            local deps
            deps=$(get_component_dependencies "${other}")
            for dep in ${deps}; do
                if [[ "${dep}" == "${component}" ]]; then
                    is_blocked=true
                    break
                fi
            done

            if [[ "${is_blocked}" == "true" ]]; then
                break
            fi
        done

        if [[ "${is_blocked}" != "true" ]]; then
            READY_COMPONENTS+=("${component}")
        fi
    done
}

# When a component fails, mark all components it depends on (transitively) as skipped
mark_dependencies_skipped() {
    local failed_component="$1"
    local deps
    deps=$(get_component_dependencies "${failed_component}")

    for dep in ${deps}; do
        # Only skip if the dependency is still pending
        if [[ "${COMPONENT_STATE[$dep]:-}" == "pending" ]]; then
            COMPONENT_STATE["${dep}"]="skipped"
            DESTRUCTION_RESULTS["${dep}"]="skipped"
            log_warn "Skipping ${dep}: dependent '${failed_component}' failed to destroy (resources still in use)"
            # Recursively skip transitive dependencies
            mark_dependencies_skipped "${dep}"
        fi
    done
}

# Check if there are any components still pending
has_pending_components() {
    for component in "${!COMPONENT_STATE[@]}"; do
        if [[ "${COMPONENT_STATE[$component]}" == "pending" ]]; then
            return 0
        fi
    done
    return 1
}

# =============================================================================
# CDK Destruction Functions
# =============================================================================

destroy_component_async() {
    local component="$1"
    local component_dir="${ROOT_DIR}/lib/${component}/cdk"

    # Check if component directory exists
    if [[ ! -d "${component_dir}" ]]; then
        echo "Component CDK directory not found: ${component_dir}" >&2
        echo "Skipping ${component} (may not be deployed)" >&2
        return 0
    fi

    # Check if node_modules exists, install if needed
    if [[ ! -d "${component_dir}/node_modules" ]]; then
        echo "Installing dependencies for ${component}..." >&2
        if ! (cd "${component_dir}" && npm install --silent 2>&1); then
            echo "Failed to install dependencies for ${component}" >&2
            return 1
        fi
    fi

    # Pre-bundle Lambda assets if the component defines a prebundle script.
    # This is needed for CDK synthesis during destroy to resolve Lambda code paths.
    if ! (cd "${component_dir}" && npm run prebundle:lambda --if-present 2>&1); then
        echo "Failed to prebundle Lambda assets for ${component}, continuing..." >&2
    fi

    # Run CDK destroy with retry logic for transient errors
    local max_attempts=3
    local attempt=1

    while [[ ${attempt} -le ${max_attempts} ]]; do
        echo "Destroying stacks for ${component} (attempt ${attempt}/${max_attempts})..." >&2
        if (cd "${component_dir}" && npx cdk destroy --all --force 2>&1); then
            echo "${component} stacks destroyed successfully" >&2
            return 0
        fi

        if [[ ${attempt} -lt ${max_attempts} ]]; then
            echo "${component} destruction failed (attempt ${attempt}/${max_attempts}), retrying in 30s..." >&2
            sleep 30
        fi
        ((attempt++))
    done

    echo "${component} destruction failed after ${max_attempts} attempts" >&2
    return 1
}

# Destroy a wave of components in parallel and collect results
destroy_wave() {
    local wave_num="$1"
    shift
    local components=("$@")
    local pids=()
    local temp_dir
    temp_dir=$(mktemp -d)

    # Record wave assignment for summary display
    for component in "${components[@]}"; do
        COMPONENT_WAVE["${component}"]="${wave_num}"
    done

    # Start all destructions in background
    for component in "${components[@]}"; do
        COMPONENT_STATE["${component}"]="destroying"
        (destroy_component_async "${component}" > "${temp_dir}/${component}.log" 2>&1) &
        pids+=($!)
        log_info "Started destruction for ${component} (PID: ${pids[-1]})"
    done

    # Wait for all destructions and collect results
    for i in "${!pids[@]}"; do
        local pid="${pids[$i]}"
        local component="${components[$i]}"

        log_info "Waiting for ${component} destruction (PID: ${pid})..."

        if wait "${pid}"; then
            COMPONENT_STATE["${component}"]="destroyed"
            DESTRUCTION_RESULTS["${component}"]="success"
            log_success "${component} destruction completed successfully"
        else
            COMPONENT_STATE["${component}"]="failed"
            DESTRUCTION_RESULTS["${component}"]="failed"
            log_error "${component} destruction failed"
            # Mark transitive dependencies as skipped
            mark_dependencies_skipped "${component}"
        fi

        # Show component log
        if [[ -f "${temp_dir}/${component}.log" ]]; then
            while IFS= read -r line; do
                log_info "  [${component}] ${line}"
            done < "${temp_dir}/${component}.log"
        fi
    done

    rm -rf "${temp_dir}"
}

# =============================================================================
# Destruction Summary
# =============================================================================

display_destruction_summary() {
    echo ""
    log_info "════════════════════════════════════════════════════════════════"
    log_info "                     DESTRUCTION SUMMARY                        "
    log_info "════════════════════════════════════════════════════════════════"

    local success_count=0
    local failed_count=0
    local dry_run_count=0
    local skipped_count=0
    local total_count=0

    for component in "${!DESTRUCTION_RESULTS[@]}"; do
        local status="${DESTRUCTION_RESULTS[$component]}"
        total_count=$((total_count + 1))
        case "${status}" in
            success) success_count=$((success_count + 1)) ;;
            failed) failed_count=$((failed_count + 1)) ;;
            dry-run) dry_run_count=$((dry_run_count + 1)) ;;
            skipped) skipped_count=$((skipped_count + 1)) ;;
        esac
    done

    if [[ ${total_count} -eq 0 ]]; then
        log_info "  No components were destroyed."
        log_info "════════════════════════════════════════════════════════════════"
        echo ""
        return
    fi

    log_info "  Component Status:"

    # Group components by wave, sorted by wave number then alphabetically within each wave
    local max_wave=0
    for component in "${!DESTRUCTION_RESULTS[@]}"; do
        local w="${COMPONENT_WAVE[$component]:-0}"
        if [[ ${w} -gt ${max_wave} ]]; then
            max_wave=${w}
        fi
    done

    for ((w=1; w<=max_wave; w++)); do
        local wave_components=()
        for component in "${!DESTRUCTION_RESULTS[@]}"; do
            if [[ "${COMPONENT_WAVE[$component]:-0}" == "${w}" ]]; then
                wave_components+=("${component}")
            fi
        done

        if [[ ${#wave_components[@]} -eq 0 ]]; then
            continue
        fi

        log_info "  ── Wave ${w} ──"
        local sorted
        sorted=$(printf '%s\n' "${wave_components[@]}" | sort)

        for component in ${sorted}; do
            local status="${DESTRUCTION_RESULTS[$component]}"
            case "${status}" in
                success)
                    log_success "    ${component}: ✓ DESTROYED"
                    ;;
                failed)
                    log_error "    ${component}: ✗ FAILED"
                    ;;
                dry-run)
                    log_info "    ${component}: ○ DRY-RUN"
                    ;;
                skipped)
                    log_warn "    ${component}: - SKIPPED (dependency failed)"
                    ;;
            esac
        done
    done

    # Show any skipped components that never entered a wave
    local skipped_no_wave=()
    for component in "${!DESTRUCTION_RESULTS[@]}"; do
        if [[ "${DESTRUCTION_RESULTS[$component]}" == "skipped" && -z "${COMPONENT_WAVE[$component]:-}" ]]; then
            skipped_no_wave+=("${component}")
        fi
    done

    if [[ ${#skipped_no_wave[@]} -gt 0 ]]; then
        log_info "  ── Skipped ──"
        local sorted_skipped
        sorted_skipped=$(printf '%s\n' "${skipped_no_wave[@]}" | sort)
        for component in ${sorted_skipped}; do
            log_warn "    ${component}: - SKIPPED (dependency failed)"
        done
    fi

    echo ""
    log_info "────────────────────────────────────────────────────────────────"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "  Mode: DRY-RUN (no actual destructions performed)"
        log_info "  Components that would be destroyed: ${dry_run_count}"
    else
        log_info "  Total: ${total_count}  |  Success: ${success_count}  |  Failed: ${failed_count}  |  Skipped: ${skipped_count}"
    fi

    log_info "════════════════════════════════════════════════════════════════"
    echo ""

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "Dry run completed. Run without -d/--dry-run to destroy."
    elif [[ ${failed_count} -gt 0 ]]; then
        log_error "Destruction completed with ${failed_count} failure(s) and ${skipped_count} skipped. Review errors above."
    else
        log_success "All ${success_count} component(s) destroyed successfully!"
    fi
}

# =============================================================================
# Main Function
# =============================================================================
main() {
    log_info "OSML Destroy Script starting"
    log_info "Working directory: ${ROOT_DIR}"

    cd "${ROOT_DIR}"

    read_config "${CONFIG_PATH}"
    populate_component_names

    # Build the list of components to destroy
    build_destroy_candidates

    # Display configuration summary
    log_info "Configuration summary:"
    log_info "  Config file: ${CONFIG_PATH}"
    log_info "  Dry run: ${DRY_RUN}"
    log_info "  Components to destroy: ${DESTROY_CANDIDATES[*]}"

    if [[ ${#DESTROY_CANDIDATES[@]} -eq 0 ]]; then
        log_info "No components to destroy."
        return
    fi

    # Execute destruction waves using topological sort
    local wave_num=0

    while has_pending_components; do
        wave_num=$((wave_num + 1))

        get_ready_components

        if [[ ${#READY_COMPONENTS[@]} -eq 0 ]]; then
            # No ready components but still pending — this means a circular dependency
            # or all remaining components are blocked by failures
            log_warn "No more components can be destroyed (remaining are blocked by failures)"
            # Mark remaining pending as skipped
            for component in "${!COMPONENT_STATE[@]}"; do
                if [[ "${COMPONENT_STATE[$component]}" == "pending" ]]; then
                    COMPONENT_STATE["${component}"]="skipped"
                    DESTRUCTION_RESULTS["${component}"]="skipped"
                fi
            done
            break
        fi

        log_wave "═══════════════════════════════════════════════════════════════"
        log_wave "Starting Wave ${wave_num}"
        log_wave "Components: ${READY_COMPONENTS[*]}"
        log_wave "═══════════════════════════════════════════════════════════════"

        if [[ "${DRY_RUN}" == "true" ]]; then
            for component in "${READY_COMPONENTS[@]}"; do
                log_info "[DRY-RUN] Would destroy ${component}"
                COMPONENT_STATE["${component}"]="destroyed"
                DESTRUCTION_RESULTS["${component}"]="dry-run"
                COMPONENT_WAVE["${component}"]="${wave_num}"
            done
        else
            destroy_wave "${wave_num}" "${READY_COMPONENTS[@]}"
        fi

        log_wave "Wave ${wave_num} completed"
    done

    display_destruction_summary

    # Check for failures and exit with appropriate code
    local has_failures=false
    for component in "${!DESTRUCTION_RESULTS[@]}"; do
        if [[ "${DESTRUCTION_RESULTS[$component]}" == "failed" ]]; then
            has_failures=true
            break
        fi
    done

    if [[ "${has_failures}" == "true" ]]; then
        log_error "OSML Destroy Script completed with failures"
        exit ${EXIT_CDK_ERROR}
    fi

    log_success "OSML Destroy Script completed"
}

# =============================================================================
# Script Entry Point
# =============================================================================
parse_arguments "$@"
main
