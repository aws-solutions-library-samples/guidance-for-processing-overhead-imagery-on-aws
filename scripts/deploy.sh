#!/bin/bash
#
# Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
#
# OSML Deployment Script
# Orchestrates cloning, configuration, and CDK deployment of OSML components
# using dependency-based topological sort for optimal ordering and parallelism.
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
EXIT_GIT_ERROR=2
EXIT_CDK_ERROR=3


# Global outputs store: component -> JSON outputs
declare -A COMPONENT_OUTPUTS

# Track deployment results for summary
declare -A DEPLOYMENT_RESULTS

# Component state for topological sort: pending, deploying, deployed, failed, skipped
declare -A COMPONENT_STATE

# Component names will be populated dynamically from config
COMPONENT_NAMES=()

# Arrays populated by functions (avoid subshell state loss)
DEPLOY_CANDIDATES=()
READY_COMPONENTS=()

# Track which wave each component was deployed in
declare -A COMPONENT_WAVE

# =============================================================================
# Logging Functions
# =============================================================================

# Color codes for terminal output (disabled if not a TTY)
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
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_BLUE}[INFO]   ${COLOR_RESET} $*"
}

log_warn() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_YELLOW}[WARN]   ${COLOR_RESET} $*" >&2
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_RED}[ERROR]  ${COLOR_RESET} $*" >&2
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_GREEN}[SUCCESS]${COLOR_RESET} $*"
}

log_wave() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${COLOR_CYAN}[WAVE]   ${COLOR_RESET} $*"
}

log_operation_start() {
    local operation="$1"
    local component="${2:-}"
    if [[ -n "${component}" ]]; then
        log_info "Starting operation: ${operation} for component: ${component}"
    else
        log_info "Starting operation: ${operation}"
    fi
}

log_operation_end() {
    local operation="$1"
    local component="${2:-}"
    local status="${3:-success}"
    if [[ "${status}" == "success" ]]; then
        if [[ -n "${component}" ]]; then
            log_success "Completed operation: ${operation} for component: ${component}"
        else
            log_success "Completed operation: ${operation}"
        fi
    else
        if [[ -n "${component}" ]]; then
            log_error "Failed operation: ${operation} for component: ${component}"
        else
            log_error "Failed operation: ${operation}"
        fi
    fi
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

exit_git_error() {
    local message="$1"
    local component="${2:-}"
    if [[ -n "${component}" ]]; then
        log_error "Git operation failed for ${component}: ${message}"
    else
        log_error "Git operation failed: ${message}"
    fi
    exit ${EXIT_GIT_ERROR}
}

exit_cdk_error() {
    local message="$1"
    local component="${2:-}"
    if [[ -n "${component}" ]]; then
        log_error "CDK deployment failed for ${component}: ${message}"
    else
        log_error "CDK deployment failed: ${message}"
    fi
    exit ${EXIT_CDK_ERROR}
}



# =============================================================================
# Help Function
# =============================================================================
show_help() {
    cat << EOF
OSML Deployment Script

Usage: $(basename "$0") [OPTIONS] [COMPONENT...]

Options:
  -c, --config FILE       Path to config file (default: ${DEFAULT_CONFIG_PATH})
  --git-clone-force       Remove and re-clone repositories from gitUrl (destructive)
  -d, --dry-run           Show what would be done without executing
  -s, --stage             Clone repos, install deps, and generate configs but skip CDK deploy
  -h, --help              Show this help message

Default Behavior:
  By default, the script deploys whatever code exists in the lib/ directories.
  If a component is clean and on the configured branch, it will automatically
  pull the latest changes (fast-forward only). If a component's local state
  differs from the gitTarget in deployment.json (different branch/tag or local
  changes), a warning is displayed but deployment proceeds with the local state.
  Use --git-clone-force to remove local directories and clone fresh from the
  configured gitUrl and gitTarget.

Components:
  If specified, only deploy the listed components (plus dependencies)
  Component names match directory names in lib/ (e.g., osml-vpc, osml-model-runner)

Deployment Order:
  Components are deployed using dependency-based topological sort:
  - Components with no dependencies are deployed first (in parallel)
  - As each wave completes, components whose dependencies are satisfied deploy next
  - If a component fails, all components that depend on it are skipped
  This maximizes parallelism while respecting resource dependencies.

Git Target (gitTarget in config):
  The gitTarget field supports multiple formats:
    - Branch name:    "main", "develop"
    - Tag:            "v1.2.0"
    - Commit SHA:     "abc123def456" (7-40 hex characters)
    - Caret notation: "^v1.2.0" (latest tag >=v1.2.0 and <v2.0.0)

Git Protocol (gitProtocol in config):
  Optional field to specify clone protocol (default: "https"):
    - "https":  Clone using HTTPS (public repos, token auth)
    - "ssh":    Clone using SSH (private repos, SSH key auth)
                Automatically converts HTTPS URLs to SSH format

Examples:
  $(basename "$0")                          # Deploy using existing lib/ contents
  $(basename "$0") osml-model-runner        # Deploy only model runner
  $(basename "$0") --git-clone-force        # Force fresh clone of all components
  $(basename "$0") -c custom-config.json    # Use custom config file

EOF
}

# =============================================================================
# Argument Parsing
# =============================================================================
CONFIG_PATH="${DEFAULT_CONFIG_PATH}"
FORCE_CLONE=false
DRY_RUN=false
STAGE_ONLY=false
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
            --git-clone-force)
                FORCE_CLONE=true
                shift
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -s|--stage)
                STAGE_ONLY=true
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

    local account_id
    local account_region

    account_id=$(jq -r '.account.id // empty' "${config_file}")
    account_region=$(jq -r '.account.region // empty' "${config_file}")

    if [[ -z "${account_id}" ]]; then
        exit_config_error "Missing required field: account.id"
    fi

    if [[ -z "${account_region}" ]]; then
        exit_config_error "Missing required field: account.region"
    fi

    if ! [[ "${account_id}" =~ ^[0-9]{12}$ ]]; then
        exit_config_error "Invalid AWS account ID format: ${account_id} (must be 12 digits)"
    fi

    log_success "Configuration validated successfully"
}

read_config() {
    local config_file="$1"

    log_info "Reading configuration from: ${config_file}"
    validate_config "${config_file}"

    CONFIG_JSON=$(cat "${config_file}")
}

get_account_settings() {
    echo "${CONFIG_JSON}" | jq '.account'
}

get_component_deploy_flag() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq -r ".[\"${component}\"].deploy // false"
}

get_component_git_url() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq -r ".[\"${component}\"].gitUrl // empty"
}

get_component_git_target() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq -r ".[\"${component}\"].gitTarget // \"main\""
}

get_component_git_protocol() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq -r ".[\"${component}\"].gitProtocol // \"https\""
}

get_component_dependencies() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq -r ".[\"${component}\"].dependsOn // [] | .[]"
}

# Get the actual git state of a component for display in summary
# Returns a formatted string showing: actual_ref[*] [(config: expected)]
# Where * indicates local changes, and (config: X) shows if actual differs from config
get_component_git_state() {
    local component="$1"
    local target_dir="${ROOT_DIR}/lib/${component}"
    local configured_target
    configured_target=$(get_component_git_target "${component}")

    # Check if directory exists and is a git repo
    if [[ ! -d "${target_dir}/.git" ]]; then
        echo "not-a-repo"
        return
    fi

    # Get current branch/ref
    local current_ref
    current_ref=$(cd "${target_dir}" && git rev-parse --abbrev-ref HEAD 2>/dev/null)

    # Handle detached HEAD - show short commit SHA
    if [[ "${current_ref}" == "HEAD" ]]; then
        local commit_sha
        commit_sha=$(cd "${target_dir}" && git rev-parse --short HEAD 2>/dev/null)
        # Check if we're on a tag
        local tag_name
        tag_name=$(cd "${target_dir}" && git describe --tags --exact-match HEAD 2>/dev/null || true)
        if [[ -n "${tag_name}" ]]; then
            current_ref="${tag_name}"
        else
            current_ref="${commit_sha} (detached)"
        fi
    fi

    # Check for local changes
    local has_changes=""
    if [[ -n "$(cd "${target_dir}" && git status --porcelain 2>/dev/null)" ]]; then
        has_changes=" +modified"
    fi

    # Check if current state matches configured target
    local config_note=""
    local is_match=false

    # Direct match on branch/tag name
    if [[ "${current_ref}" == "${configured_target}" ]]; then
        is_match=true
    fi

    # Check if current commit matches configured target (for tags/commits)
    if [[ "${is_match}" == "false" ]]; then
        local current_commit
        local configured_commit=""
        current_commit=$(cd "${target_dir}" && git rev-parse HEAD 2>/dev/null)

        # Try to resolve configured target to a commit
        if cd "${target_dir}" && git rev-parse "${configured_target}" &>/dev/null; then
            configured_commit=$(git rev-parse "${configured_target}" 2>/dev/null)
        elif cd "${target_dir}" && git rev-parse "refs/tags/${configured_target}" &>/dev/null; then
            configured_commit=$(git rev-parse "refs/tags/${configured_target}" 2>/dev/null)
        elif cd "${target_dir}" && git rev-parse "refs/remotes/origin/${configured_target}" &>/dev/null; then
            configured_commit=$(git rev-parse "refs/remotes/origin/${configured_target}" 2>/dev/null)
        fi

        if [[ -n "${configured_commit}" && "${current_commit}" == "${configured_commit}" ]]; then
            is_match=true
        fi
    fi

    if [[ "${is_match}" == "false" ]]; then
        config_note=" (config: ${configured_target})"
    fi

    echo "${current_ref}${has_changes}${config_note}"
}

get_component_retries() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq -r ".[\"${component}\"].retry // 0"
}

get_component_config() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq ".[\"${component}\"].config // {}"
}

get_component_sam3_pt_path() {
    local component="$1"
    echo "${CONFIG_JSON}" | jq -r ".[\"${component}\"].sam3PtLocalPath // empty"
}

# Get all component names from config (keys that have a "deploy" property)
get_all_components() {
    echo "${CONFIG_JSON}" | jq -r 'to_entries | map(select(.value.deploy != null)) | .[].key'
}

# Populate COMPONENT_NAMES array from config
populate_component_names() {
    local components
    components=$(get_all_components)

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
# Repository Clone Functions
# =============================================================================

# Convert HTTPS URL to SSH URL format
# Input:  https://github.com/org/repo or https://github.com/org/repo.git
# Output: git@github.com:org/repo.git
convert_https_to_ssh() {
    local https_url="$1"

    # Remove trailing slash if present
    https_url="${https_url%/}"

    # Remove .git suffix if present (we'll add it back)
    https_url="${https_url%.git}"

    # Extract host and path from HTTPS URL
    # Pattern: https://hostname/path
    if [[ "${https_url}" =~ ^https://([^/]+)/(.+)$ ]]; then
        local host="${BASH_REMATCH[1]}"
        local path="${BASH_REMATCH[2]}"
        echo "git@${host}:${path}.git"
    else
        # If pattern doesn't match, return original URL
        log_warn "Could not convert URL to SSH format: ${https_url}"
        echo "${https_url}"
    fi
}

# Resolve a git target to a specific ref (commit SHA, tag, or branch)
# Supports:
#   - Branch names: "main", "develop"
#   - Tags: "v1.2.0"
#   - Commit SHAs: "abc123def456..."
#   - Caret notation (semver-style):
#       "^v1.2.0" means >=v1.2.0 and <v2.0.0 (latest v1.x.x where x.x >= 2.0)
#       "^v1.2.3" means >=v1.2.3 and <v2.0.0
resolve_git_target() {
    local target_dir="$1"
    local git_target="$2"
    local component="$3"
    local resolved_ref=""

    # Note: All log calls in this function redirect to stderr (>&2) because
    # the function returns its value via echo to stdout

    # Check if target uses caret notation for version range (e.g., "^v1.2.0")
    if [[ "${git_target}" =~ ^\^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        local major="${BASH_REMATCH[1]}"
        local minor="${BASH_REMATCH[2]}"
        local patch="${BASH_REMATCH[3]}"
        local next_major=$((major + 1))

        log_info "Resolving caret range ${git_target} (>=v${major}.${minor}.${patch} <v${next_major}.0.0) for ${component}" >&2

        if ! (cd "${target_dir}" && git fetch --tags --force 2>&1); then
            log_warn "Failed to fetch tags, continuing with existing tags" >&2
        fi

        resolved_ref=$(cd "${target_dir}" && git tag -l "v${major}.*" | \
            grep -E "^v${major}\.[0-9]+\.[0-9]+$" | \
            while read -r tag; do
                if [[ "${tag}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
                    local t_minor="${BASH_REMATCH[2]}"
                    local t_patch="${BASH_REMATCH[3]}"
                    if [[ "${t_minor}" -gt "${minor}" ]] || \
                       [[ "${t_minor}" -eq "${minor}" && "${t_patch}" -ge "${patch}" ]]; then
                        echo "${tag}"
                    fi
                fi
            done | sort -V | tail -n 1)

        if [[ -z "${resolved_ref}" ]]; then
            log_error "No tags found matching caret range ${git_target}" >&2
            return 1
        fi

        log_info "Resolved ${git_target} to tag: ${resolved_ref}" >&2
        echo "${resolved_ref}"
        return 0
    fi

    # Check if target looks like a commit SHA
    if [[ "${git_target}" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
        log_info "Git target appears to be a commit SHA: ${git_target}" >&2
        if (cd "${target_dir}" && git cat-file -t "${git_target}" &>/dev/null); then
            echo "${git_target}"
            return 0
        else
            log_error "Commit SHA not found: ${git_target}" >&2
            return 1
        fi
    fi

    # Check if target is a tag
    if (cd "${target_dir}" && git rev-parse "refs/tags/${git_target}" &>/dev/null); then
        log_info "Git target is a tag: ${git_target}" >&2
        echo "${git_target}"
        return 0
    fi

    # Check if target is a branch
    if (cd "${target_dir}" && git rev-parse "refs/remotes/origin/${git_target}" &>/dev/null); then
        log_info "Git target is a branch: ${git_target}" >&2
        echo "${git_target}"
        return 0
    fi

    # Fallback
    log_info "Git target type unknown, will attempt checkout: ${git_target}" >&2
    echo "${git_target}"
    return 0
}

clone_repository() {
    local component="$1"
    local git_url="$2"
    local git_target="$3"
    local target_dir="${ROOT_DIR}/lib/${component}"

    # Check if SSH protocol is requested and convert URL if needed
    local git_protocol
    git_protocol=$(get_component_git_protocol "${component}")

    if [[ "${git_protocol}" == "ssh" ]]; then
        local original_url="${git_url}"
        git_url=$(convert_https_to_ssh "${git_url}")
        log_info "Using SSH protocol: ${original_url} → ${git_url}"
    fi

    log_operation_start "clone" "${component}"
    log_info "Cloning ${component} from ${git_url}"

    if [[ -d "${target_dir}" ]]; then
        log_info "Removing existing directory: ${target_dir}"
        if [[ "${DRY_RUN}" == "true" ]]; then
            log_info "[DRY-RUN] Would remove: ${target_dir}"
        else
            rm -rf "${target_dir}"
        fi
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would clone: ${git_url} to ${target_dir}"
        log_info "[DRY-RUN] Would checkout: ${git_target}"
    else
        # Clone without auto-fetching LFS files to avoid partial checkout failures
        # LFS files will be pulled explicitly after checkout with retry logic
        if ! GIT_LFS_SKIP_SMUDGE=1 git clone --tags "${git_url}" "${target_dir}"; then
            log_operation_end "clone" "${component}" "failed"
            exit_git_error "git clone failed for ${git_url}" "${component}"
        fi

        local resolved_target
        if ! resolved_target=$(resolve_git_target "${target_dir}" "${git_target}" "${component}"); then
            log_operation_end "clone" "${component}" "failed"
            exit_git_error "Failed to resolve git target: ${git_target}" "${component}"
        fi

        log_info "Checking out ${resolved_target} for ${component}"
        if ! (cd "${target_dir}" && git checkout "${resolved_target}"); then
            log_operation_end "clone" "${component}" "failed"
            exit_git_error "Failed to checkout ${resolved_target}" "${component}"
        fi

        local commit_sha
        commit_sha=$(cd "${target_dir}" && git rev-parse HEAD)
        log_info "Checked out commit: ${commit_sha:0:12}"

        # Pull LFS files with retry logic for transient server errors
        if (cd "${target_dir}" && git lfs ls-files 2>/dev/null | grep -q .); then
            log_info "Pulling Git LFS files for ${component}"
            local lfs_max_attempts=3
            local lfs_attempt=1
            local lfs_success=false

            while [[ ${lfs_attempt} -le ${lfs_max_attempts} ]]; do
                if (cd "${target_dir}" && git lfs pull); then
                    lfs_success=true
                    break
                fi

                if [[ ${lfs_attempt} -lt ${lfs_max_attempts} ]]; then
                    log_warn "Git LFS pull failed (attempt ${lfs_attempt}/${lfs_max_attempts}), retrying in 10s..."
                    sleep 10
                fi
                ((lfs_attempt++))
            done

            if [[ "${lfs_success}" != "true" ]]; then
                log_operation_end "clone" "${component}" "failed"
                exit_git_error "Git LFS pull failed after ${lfs_max_attempts} attempts" "${component}"
            fi
        fi
    fi

    log_operation_end "clone" "${component}" "success"
}

clone_components() {
    local components=("$@")

    # Default behavior: use existing lib/ contents, don't clone
    if [[ "${FORCE_CLONE}" != "true" ]]; then
        log_info "Using existing lib/ contents (default behavior)"
        log_info "Use --git-clone-force to remove and re-clone repositories"
        return
    fi

    log_info "Force clone enabled - removing and re-cloning repositories"

    if [[ ${#components[@]} -eq 0 ]]; then
        return
    fi

    for component in "${components[@]}"; do
        local git_url
        local git_target

        git_url=$(get_component_git_url "${component}")
        git_target=$(get_component_git_target "${component}")

        # Skip components without gitUrl (e.g., osml-vpc which is local)
        if [[ -z "${git_url}" ]]; then
            log_info "No gitUrl for ${component}, skipping clone"
            continue
        fi

        clone_repository "${component}" "${git_url}" "${git_target}"
    done
}

# =============================================================================
# Component Sync Check Functions
# =============================================================================

# Check if a component's local state matches the deployment.json configuration
# Returns a status string and exit code:
#   0 = in sync, 1 = missing, 2 = not git repo, 3 = different ref, 4 = local changes, 5 = both
check_component_sync() {
    local component="$1"
    local target_dir="${ROOT_DIR}/lib/${component}"
    local expected_target
    expected_target=$(get_component_git_target "${component}")

    # Check if directory exists
    if [[ ! -d "${target_dir}" ]]; then
        echo "MISSING"
        return 1
    fi

    # Check if it's a git repo
    if [[ ! -d "${target_dir}/.git" ]]; then
        echo "NOT_GIT_REPO"
        return 2
    fi

    # Get current state
    local current_branch
    local current_commit
    local has_changes

    current_branch=$(cd "${target_dir}" && git rev-parse --abbrev-ref HEAD 2>/dev/null)
    current_commit=$(cd "${target_dir}" && git rev-parse HEAD 2>/dev/null)
    has_changes=$(cd "${target_dir}" && git status --porcelain 2>/dev/null)

    # Determine if we're on the expected target
    local is_on_expected=false
    local current_display="${current_branch}"

    # Handle detached HEAD state
    if [[ "${current_branch}" == "HEAD" ]]; then
        current_display="${current_commit:0:12} (detached)"
    fi

    # Check if current branch matches expected
    if [[ "${current_branch}" == "${expected_target}" ]]; then
        is_on_expected=true
    fi

    # Check if we're on a tag that matches expected
    if [[ "${is_on_expected}" == "false" ]]; then
        local current_tags
        current_tags=$(cd "${target_dir}" && git tag --points-at HEAD 2>/dev/null)
        if echo "${current_tags}" | grep -qx "${expected_target}"; then
            is_on_expected=true
            current_display="${expected_target} (tag)"
        fi
    fi

    # Check if expected is a commit SHA and current commit matches
    if [[ "${is_on_expected}" == "false" && "${expected_target}" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
        if [[ "${current_commit}" == "${expected_target}"* ]] || [[ "${expected_target}" == "${current_commit:0:${#expected_target}}" ]]; then
            is_on_expected=true
        fi
    fi

    # Check if expected target resolves to current commit (for tags)
    if [[ "${is_on_expected}" == "false" ]]; then
        local expected_commit=""
        # Try to resolve expected target - check tag, remote branch, or direct ref
        if cd "${target_dir}" && git rev-parse "refs/tags/${expected_target}" &>/dev/null; then
            expected_commit=$(git rev-parse "refs/tags/${expected_target}")
        elif cd "${target_dir}" && git rev-parse "refs/remotes/origin/${expected_target}" &>/dev/null; then
            expected_commit=$(git rev-parse "refs/remotes/origin/${expected_target}")
        elif cd "${target_dir}" && git rev-parse "${expected_target}" &>/dev/null; then
            expected_commit=$(git rev-parse "${expected_target}")
        fi
        if [[ -n "${expected_commit}" && "${current_commit}" == "${expected_commit}" ]]; then
            is_on_expected=true
        fi
    fi

    # Build result
    local result=""
    local return_code=0

    if [[ "${is_on_expected}" == "false" ]]; then
        result="DIFFERENT_REF:${current_display}:${expected_target}"
        return_code=3
    fi

    if [[ -n "${has_changes}" ]]; then
        if [[ ${return_code} -eq 3 ]]; then
            result="${result}|LOCAL_CHANGES"
            return_code=5
        else
            result="LOCAL_CHANGES"
            return_code=4
        fi
    fi

    if [[ ${return_code} -eq 0 ]]; then
        result="IN_SYNC"
    fi

    echo "${result}"
    return ${return_code}
}

# Display a formatted warning for a component that is out of sync
display_sync_warning() {
    local component="$1"
    local sync_status="$2"
    local configured_target
    local target_dir

    configured_target=$(get_component_git_target "${component}")
    target_dir="${ROOT_DIR}/lib/${component}"

    echo ""
    log_warn "════════════════════════════════════════════════════════════════════════════════"
    log_warn "  WARNING: Component '${component}' diverges from deployment.json"
    log_warn "════════════════════════════════════════════════════════════════════════════════"

    case "${sync_status}" in
        MISSING)
            log_warn "  Directory does not exist: lib/${component}"
            log_warn "  Configured target: ${configured_target}"
            log_warn ""
            log_warn "  Use --git-clone-force to clone the repository"
            ;;
        NOT_GIT_REPO)
            log_warn "  Directory exists but is not a git repository"
            log_warn "  Path: lib/${component}"
            log_warn ""
            log_warn "  Use --git-clone-force to remove and clone fresh"
            ;;
        DIFFERENT_REF:*\|LOCAL_CHANGES)
            local ref_part="${sync_status%%|*}"
            local current_ref="${ref_part#DIFFERENT_REF:}"
            current_ref="${current_ref%%:*}"
            local configured_ref="${ref_part##*:}"
            log_warn "  Currently on:       ${current_ref}"
            log_warn "  Configured target:  ${configured_ref}"
            log_warn "  AND has local uncommitted changes"
            log_warn ""
            log_warn "  Proceeding with deployment using current state."
            log_warn "  Use --git-clone-force to reset to configured state."
            ;;
        DIFFERENT_REF:*)
            local current_ref="${sync_status#DIFFERENT_REF:}"
            current_ref="${current_ref%%:*}"
            local configured_ref="${sync_status##*:}"
            log_warn "  Currently on:       ${current_ref}"
            log_warn "  Configured target:  ${configured_ref}"
            log_warn ""
            log_warn "  Proceeding with deployment using current state."
            log_warn "  Use --git-clone-force to reset to configured state."
            ;;
        LOCAL_CHANGES)
            log_warn "  Local uncommitted changes detected"
            log_warn "  Configured target: ${configured_target}"
            log_warn ""
            log_warn "  Proceeding with deployment including local changes."
            log_warn "  Use --git-clone-force to reset to clean state."
            ;;
    esac

    log_warn "════════════════════════════════════════════════════════════════════════════════"
    echo ""
}

# Update a component's branch to latest if it's clean and on a branch
# Returns 0 if update succeeded or wasn't needed, 1 if update failed
update_component_if_clean() {
    local component="$1"
    local target_dir="${ROOT_DIR}/lib/${component}"
    local configured_target
    configured_target=$(get_component_git_target "${component}")

    # Check if directory exists and is a git repo
    if [[ ! -d "${target_dir}/.git" ]]; then
        return 0
    fi

    # Get current state
    local current_branch
    local has_changes

    current_branch=$(cd "${target_dir}" && git rev-parse --abbrev-ref HEAD 2>/dev/null)
    has_changes=$(cd "${target_dir}" && git status --porcelain 2>/dev/null)

    # Only proceed if:
    # 1. We're on a branch (not detached HEAD)
    # 2. The branch matches the configured target
    # 3. There are no local changes
    if [[ "${current_branch}" == "HEAD" ]]; then
        # Detached HEAD - could be a tag or commit, skip update
        return 0
    fi

    if [[ "${current_branch}" != "${configured_target}" ]]; then
        # On a different branch than configured, skip update
        return 0
    fi

    if [[ -n "${has_changes}" ]]; then
        # Has local changes, skip update
        return 0
    fi

    # Check if configured target looks like a tag or commit SHA
    # Tags and commits are static, so no need to pull
    if [[ "${configured_target}" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
        # Looks like a commit SHA
        return 0
    fi

    if (cd "${target_dir}" && git rev-parse "refs/tags/${configured_target}" &>/dev/null); then
        # It's a tag
        return 0
    fi

    # At this point, we're on a clean branch that matches config
    # Fetch and pull latest changes
    log_info "Updating ${component} on branch ${current_branch} to latest..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would fetch and pull latest for ${component}"
        return 0
    fi

    # Fetch latest from remote
    if ! (cd "${target_dir}" && git fetch origin "${current_branch}" 2>&1); then
        log_warn "Failed to fetch latest for ${component}, continuing with current state"
        return 1
    fi

    # Check if we're behind remote
    local local_commit
    local remote_commit
    local_commit=$(cd "${target_dir}" && git rev-parse HEAD)
    remote_commit=$(cd "${target_dir}" && git rev-parse "origin/${current_branch}" 2>/dev/null || echo "")

    if [[ -z "${remote_commit}" ]]; then
        log_warn "Could not determine remote commit for ${component}, skipping pull"
        return 1
    fi

    if [[ "${local_commit}" == "${remote_commit}" ]]; then
        log_info "  ${component} is already up to date"
        return 0
    fi

    # Pull latest changes (fast-forward only to be safe)
    if (cd "${target_dir}" && git pull --ff-only origin "${current_branch}" 2>&1); then
        local new_commit
        new_commit=$(cd "${target_dir}" && git rev-parse --short HEAD)
        log_success "  ${component} updated to ${new_commit}"
        return 0
    else
        log_warn "Failed to pull latest for ${component} (may need merge), continuing with current state"
        return 1
    fi
}

# Check all components and display warnings for any that are out of sync
# Also update components that are clean and on a branch
check_and_warn_component_sync() {
    local components=("$@")

    # Skip checks if we're force cloning anyway
    if [[ "${FORCE_CLONE}" == "true" ]]; then
        return
    fi

    local has_warnings=false

    for component in "${components[@]}"; do
        local git_url
        git_url=$(get_component_git_url "${component}")

        # Skip components without gitUrl (like osml-vpc which is local)
        if [[ -z "${git_url}" ]]; then
            continue
        fi

        local sync_status
        local sync_code
        sync_status=$(check_component_sync "${component}") && sync_code=0 || sync_code=$?

        if [[ ${sync_code} -eq 0 ]]; then
            # Component is in sync - try to update if it's on a branch
            update_component_if_clean "${component}"
        elif [[ ${sync_code} -ne 0 ]]; then
            display_sync_warning "${component}" "${sync_status}"
            has_warnings=true
        fi
    done

    if [[ "${has_warnings}" == "true" ]]; then
        log_info "Continuing with deployment despite warnings..."
        echo ""
    fi
}


# =============================================================================
# Model Checkpoint Setup Functions
# =============================================================================

# Setup SAM3 checkpoint file for osml-models component
# Copies the checkpoint from user's local path to lib/osml-models/assets/
# Returns 0 on success, 1 on failure (caller should handle failure gracefully)
setup_osml_models_checkpoint() {
    local components=("$@")
    local component="osml-models"

    # Check if osml-models is in the list of components being deployed
    local should_deploy=false
    for comp in "${components[@]}"; do
        if [[ "${comp}" == "${component}" ]]; then
            should_deploy=true
            break
        fi
    done

    if [[ "${should_deploy}" == "false" ]]; then
        return 0
    fi

    log_operation_start "checkpoint-setup" "${component}"

    local sam3_pt_path
    sam3_pt_path=$(get_component_sam3_pt_path "${component}")

    # Check if sam3PtLocalPath is provided
    if [[ -z "${sam3_pt_path}" ]]; then
        log_operation_end "checkpoint-setup" "${component}" "failed"
        log_error "Missing required field 'sam3PtLocalPath' for ${component}"
        log_error "The SAM3 model checkpoint file (sam3.pt) must be downloaded from HuggingFace."
        log_error "Please add 'sam3PtLocalPath' to your deployment.json configuration."
        log_error ""
        log_error "For instructions on accessing and downloading the model checkpoint, see:"
        log_error "https://github.com/awslabs/osml-models/blob/main/README.md"
        return 1
    fi

    # Expand tilde in path
    sam3_pt_path="${sam3_pt_path/#\~/$HOME}"

    # Check if source file exists
    if [[ ! -f "${sam3_pt_path}" ]]; then
        log_operation_end "checkpoint-setup" "${component}" "failed"
        log_error "SAM3 checkpoint file not found at: ${sam3_pt_path}"
        log_error "Please ensure you have downloaded the sam3.pt file from HuggingFace."
        log_error ""
        log_error "For instructions on accessing and downloading the model checkpoint, see:"
        log_error "https://github.com/awslabs/osml-models/blob/main/README.md"
        return 1
    fi

    local target_dir="${ROOT_DIR}/lib/${component}/assets"
    local target_file="${target_dir}/sam3.pt"

    # Check if target file already exists
    if [[ -f "${target_file}" ]]; then
        log_info "SAM3 checkpoint file already exists at: ${target_file}"
        log_operation_end "checkpoint-setup" "${component}" "success"
        return 0
    fi

    # Create target directory if it doesn't exist
    if [[ ! -d "${target_dir}" ]]; then
        log_info "Creating assets directory: ${target_dir}"
        if [[ "${DRY_RUN}" == "true" ]]; then
            log_info "[DRY-RUN] Would create directory: ${target_dir}"
        else
            if ! mkdir -p "${target_dir}"; then
                log_operation_end "checkpoint-setup" "${component}" "failed"
                log_error "Failed to create directory: ${target_dir}"
                return 1
            fi
        fi
    fi

    # Copy the checkpoint file
    log_info "Copying SAM3 checkpoint from: ${sam3_pt_path}"
    log_info "                         to: ${target_file}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would copy checkpoint file"
    else
        if ! cp "${sam3_pt_path}" "${target_file}"; then
            log_operation_end "checkpoint-setup" "${component}" "failed"
            log_error "Failed to copy checkpoint file"
            return 1
        fi
        log_success "SAM3 checkpoint file copied successfully"
    fi

    log_operation_end "checkpoint-setup" "${component}" "success"
    return 0
}

# =============================================================================
# Configuration Generation Functions
# =============================================================================

generate_component_config() {
    local component="$1"
    local target_dir="${ROOT_DIR}/lib/${component}/cdk/bin/deployment"
    local output_file="${target_dir}/deployment.json"

    log_operation_start "config-write" "${component}"
    log_info "Generating configuration for ${component}"

    local account_settings
    local component_config
    local project_name

    account_settings=$(get_account_settings)
    component_config=$(get_component_config "${component}")
    project_name=$(echo "${component_config}" | jq -r '.projectName // empty')

    if [[ -z "${project_name}" ]]; then
        log_operation_end "config-write" "${component}" "failed"
        exit_config_error "Missing projectName in config" "${component}"
    fi

    # Build merged config with account settings
    local merged_config
    merged_config=$(echo "${component_config}" | jq --argjson account "${account_settings}" '. + { account: $account }')

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would write config to: ${output_file}"
        log_info "[DRY-RUN] Config content:"
        echo "${merged_config}" | jq '.'
    else
        if [[ ! -d "${target_dir}" ]]; then
            log_info "Creating directory: ${target_dir}"
            mkdir -p "${target_dir}"
        fi

        if ! echo "${merged_config}" | jq '.' > "${output_file}"; then
            log_operation_end "config-write" "${component}" "failed"
            exit_config_error "Failed to write configuration file" "${component}"
        fi
    fi

    log_operation_end "config-write" "${component}" "success"
}

# Inject outputs from dependency components into a component's config
inject_dependency_outputs() {
    local component="$1"
    local config_file="${ROOT_DIR}/lib/${component}/cdk/bin/deployment/deployment.json"

    if [[ ! -f "${config_file}" ]]; then
        log_warn "Config file not found for ${component}, skipping dependency injection"
        return 0
    fi

    local dependencies
    dependencies=$(get_component_dependencies "${component}")

    if [[ -z "${dependencies}" ]]; then
        return 0
    fi

    log_info "Injecting dependency outputs into ${component} config"

    local updated_config
    updated_config=$(cat "${config_file}")

    for dep in ${dependencies}; do
        local dep_outputs="${COMPONENT_OUTPUTS[$dep]:-}"

        if [[ -z "${dep_outputs}" ]]; then
            log_warn "No outputs found for dependency ${dep}"
            continue
        fi

        log_info "  Injecting outputs from ${dep}"

        # Handle osml-vpc dependency specially - merge network config (user config takes precedence)
        if [[ "${dep}" == "osml-vpc" ]]; then
            local vpc_id
            local private_subnets

            vpc_id=$(echo "${dep_outputs}" | jq -r '.[].VpcId // empty' 2>/dev/null)
            private_subnets=$(echo "${dep_outputs}" | jq -r '.[].PrivateSubnetIds // empty' 2>/dev/null)

            if [[ -n "${vpc_id}" ]]; then
                local private_subnets_json
                private_subnets_json=$(echo "${private_subnets}" | jq -R 'split(",")')

                # Build injected network config with UPPER_SNAKE_CASE to match NetworkConfig class
                local injected_network_config
                injected_network_config=$(jq -n \
                    --arg vpcId "${vpc_id}" \
                    --argjson targetSubnets "${private_subnets_json}" \
                    '{
                        "VPC_ID": $vpcId,
                        "TARGET_SUBNETS": $targetSubnets
                    }')

                # Get existing networkConfig from user's deployment.json
                local existing_network_config
                existing_network_config=$(echo "${updated_config}" | jq '.networkConfig // {}')

                # Check for collisions and log them (user config takes precedence)
                local collisions
                collisions=$(jq -n \
                    --argjson injected "${injected_network_config}" \
                    --argjson existing "${existing_network_config}" \
                    '($injected | keys) as $ik | ($existing | keys) as $ek | $ik | map(select(. as $k | $ek | index($k))) | .[]' 2>/dev/null || true)

                if [[ -n "${collisions}" ]]; then
                    log_warn "Network config collision detected for ${component}. User-provided values take precedence:"
                    for key in ${collisions}; do
                        local user_val
                        user_val=$(echo "${existing_network_config}" | jq -r --arg k "${key}" '.[$k] // empty')
                        log_warn "  ${key}: using user value '${user_val}'"
                    done
                fi

                # Merge: injected * existing (existing/user values take precedence)
                updated_config=$(echo "${updated_config}" | jq \
                    --argjson injected "${injected_network_config}" \
                    '.networkConfig = ($injected * (.networkConfig // {}))')
            fi
        fi
        # Note: For osml-apis, dependency outputs are handled by inject_osml_apis_config()
        # which extracts specific values into dataplaneConfig. We skip adding generic
        # dependencyOutputs section as it's not needed by the component's load-deployment.ts
    done

    # Special handling for osml-apis component - inject auth server and service URLs
    if [[ "${component}" == "osml-apis" ]]; then
        updated_config=$(inject_osml_apis_config "${updated_config}")
    fi

    # Special handling for osml-web-app component - inject auth server and service URLs
    if [[ "${component}" == "osml-web-app" ]]; then
        updated_config=$(inject_webapp_config "${updated_config}")
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY-RUN] Would update config with dependency outputs: ${config_file}"
        return 0
    fi

    echo "${updated_config}" | jq '.' > "${config_file}"
    log_success "Dependency outputs injected into ${component} config"
}

# Inject osml-apis specific configuration from dependency outputs
# This function extracts auth server URL and service endpoints from deployed stacks
# Uses flattened dataplaneConfig structure with UPPER_SNAKE_CASE property names
inject_osml_apis_config() {
    local config="$1"
    local region
    region=$(echo "${config}" | jq -r '.account.region')

    # Ensure dataplaneConfig exists
    config=$(echo "${config}" | jq '.dataplaneConfig = (.dataplaneConfig // {})')

    # Extract auth server URL from amazon-mission-solutions-auth-server outputs
    local auth_outputs="${COMPONENT_OUTPUTS[amazon-mission-solutions-auth-server]:-}"
    if [[ -n "${auth_outputs}" ]]; then
        local keycloak_url
        # Find the KeycloakUrl output (key contains "KeycloakUrl")
        keycloak_url=$(echo "${auth_outputs}" | jq -r '[.[]] | add | to_entries[] | select(.key | contains("KeycloakUrl")) | .value' 2>/dev/null | head -1)

        if [[ -n "${keycloak_url}" ]]; then
            # Get the realm from authConfig (default to "osml" if not specified)
            local realm
            realm=$(echo "${config}" | jq -r '.dataplaneConfig.authConfig.realm // "osml"')

            # Construct the authority URL (OIDC issuer URL)
            local authority="${keycloak_url}/realms/${realm}"

            log_info "    Injecting auth server authority: ${authority}" >&2

            # Ensure authConfig exists and inject authority (user config takes precedence)
            config=$(echo "${config}" | jq \
                --arg authority "${authority}" \
                '.dataplaneConfig.authConfig = (.dataplaneConfig.authConfig // {}) | .dataplaneConfig.authConfig.authority = (.dataplaneConfig.authConfig.authority // $authority)')
        fi
    fi

    # Extract tile server URL and look up ALB ARN from osml-tile-server outputs
    local tile_server_outputs="${COMPONENT_OUTPUTS[osml-tile-server]:-}"
    if [[ -n "${tile_server_outputs}" ]]; then
        local tile_server_dns
        tile_server_dns=$(echo "${tile_server_outputs}" | jq -r '.[].LoadBalancerDNS // empty' 2>/dev/null)

        if [[ -n "${tile_server_dns}" ]]; then
            # Construct full URL with http:// prefix (internal ALB)
            local full_tile_server_url="http://${tile_server_dns}"

            log_info "    Injecting tile server URL: ${full_tile_server_url}" >&2

            config=$(echo "${config}" | jq \
                --arg url "${full_tile_server_url}" \
                '.dataplaneConfig.TILE_SERVER_URL = (.dataplaneConfig.TILE_SERVER_URL // $url)')

            # Look up ALB ARN from DNS name using AWS CLI
            log_info "    Looking up tile server ALB ARN from DNS: ${tile_server_dns}" >&2
            local tile_server_alb_arn
            tile_server_alb_arn=$(aws elbv2 describe-load-balancers \
                --region "${region}" \
                --query "LoadBalancers[?DNSName=='${tile_server_dns}'].LoadBalancerArn" \
                --output text 2>/dev/null)

            if [[ -n "${tile_server_alb_arn}" && "${tile_server_alb_arn}" != "None" ]]; then
                log_info "    Injecting tile server ALB ARN: ${tile_server_alb_arn}" >&2

                config=$(echo "${config}" | jq \
                    --arg arn "${tile_server_alb_arn}" \
                    '.dataplaneConfig.TILE_SERVER_ALB_ARN = (.dataplaneConfig.TILE_SERVER_ALB_ARN // $arn)')
            else
                log_warn "    Failed to look up tile server ALB ARN from DNS: ${tile_server_dns}" >&2
            fi
        fi
    fi

    # Extract data intake STAC Lambda ARN from osml-data-intake outputs
    local data_intake_outputs="${COMPONENT_OUTPUTS[osml-data-intake]:-}"
    if [[ -n "${data_intake_outputs}" ]]; then
        local stac_lambda_arn
        stac_lambda_arn=$(echo "${data_intake_outputs}" | jq -r '.[].StacLambdaArn // empty' 2>/dev/null)

        if [[ -n "${stac_lambda_arn}" ]]; then
            log_info "    Injecting data intake STAC Lambda ARN: ${stac_lambda_arn}" >&2

            config=$(echo "${config}" | jq \
                --arg arn "${stac_lambda_arn}" \
                '.dataplaneConfig.DATA_INTAKE_LAMBDA_ARN = (.dataplaneConfig.DATA_INTAKE_LAMBDA_ARN // $arn)')
        fi
    fi

    # Extract geo agents URL and look up ALB ARN from osml-geo-agents outputs
    local geo_agents_outputs="${COMPONENT_OUTPUTS[osml-geo-agents]:-}"
    if [[ -n "${geo_agents_outputs}" ]]; then
        local geo_agents_dns
        geo_agents_dns=$(echo "${geo_agents_outputs}" | jq -r '.[].LoadBalancerDNS // empty' 2>/dev/null) || geo_agents_dns=""

        if [[ -n "${geo_agents_dns}" ]]; then
            # Construct full URL with http:// prefix (internal ALB)
            local full_geo_agents_url="http://${geo_agents_dns}"

            log_info "    Injecting geo agents URL: ${full_geo_agents_url}" >&2

            config=$(echo "${config}" | jq \
                --arg url "${full_geo_agents_url}" \
                '.dataplaneConfig.GEO_AGENTS_MCP_URL = (.dataplaneConfig.GEO_AGENTS_MCP_URL // $url)')

            # Look up ALB ARN from DNS name using AWS CLI
            log_info "    Looking up geo agents ALB ARN from DNS: ${geo_agents_dns}" >&2
            local geo_agents_alb_arn
            geo_agents_alb_arn=$(aws elbv2 describe-load-balancers \
                --region "${region}" \
                --query "LoadBalancers[?DNSName=='${geo_agents_dns}'].LoadBalancerArn" \
                --output text 2>/dev/null)

            if [[ -n "${geo_agents_alb_arn}" && "${geo_agents_alb_arn}" != "None" ]]; then
                log_info "    Injecting geo agents ALB ARN: ${geo_agents_alb_arn}" >&2

                config=$(echo "${config}" | jq \
                    --arg arn "${geo_agents_alb_arn}" \
                    '.dataplaneConfig.GEO_AGENTS_ALB_ARN = (.dataplaneConfig.GEO_AGENTS_ALB_ARN // $arn)')
            else
                log_warn "    Failed to look up geo agents ALB ARN from DNS: ${geo_agents_dns}" >&2
            fi
        fi
    fi

    echo "${config}"
}

# Inject osml-web-app specific configuration from dependency outputs
# This function extracts auth server URL and service endpoints from deployed stacks
# Uses flattened dataplaneConfig structure with UPPER_SNAKE_CASE property names
inject_webapp_config() {
    local config="$1"

    # Ensure dataplaneConfig exists
    config=$(echo "${config}" | jq '.dataplaneConfig = (.dataplaneConfig // {})')

    # Extract auth server URL from amazon-mission-solutions-auth-server outputs
    local auth_outputs="${COMPONENT_OUTPUTS[amazon-mission-solutions-auth-server]:-}"
    if [[ -n "${auth_outputs}" ]]; then
        local keycloak_url
        # Find the KeycloakUrl output (key contains "KeycloakUrl")
        keycloak_url=$(echo "${auth_outputs}" | jq -r '[.[]] | add | to_entries[] | select(.key | contains("KeycloakUrl")) | .value' 2>/dev/null | head -1)

        if [[ -n "${keycloak_url}" ]]; then
            # Get the realm from authConfig (default to "osml" if not specified)
            local realm
            realm=$(echo "${config}" | jq -r '.dataplaneConfig.authConfig.realm // "osml"')

            # Construct the authority URL (OIDC issuer URL)
            local authority="${keycloak_url}/realms/${realm}"

            log_info "    Injecting auth server authority: ${authority}" >&2

            # Ensure authConfig exists and inject authority (user config takes precedence)
            config=$(echo "${config}" | jq \
                --arg authority "${authority}" \
                '.dataplaneConfig.authConfig = (.dataplaneConfig.authConfig // {}) | .dataplaneConfig.authConfig.authority = (.dataplaneConfig.authConfig.authority // $authority)')

            # Also inject audience if not already set (default to "account" for Keycloak)
            config=$(echo "${config}" | jq \
                '.dataplaneConfig.authConfig.audience = (.dataplaneConfig.authConfig.audience // "account")')
        fi
    fi

    # Extract service URLs from osml-apis outputs (public-facing API Gateway endpoints)
    local apis_outputs="${COMPONENT_OUTPUTS[osml-apis]:-}"
    if [[ -n "${apis_outputs}" ]]; then
        log_info "    Injecting service URLs from osml-apis" >&2

        # Extract tile server API URL (public-facing)
        local tile_server_url
        tile_server_url=$(echo "${apis_outputs}" | jq -r '[.[]] | add | to_entries[] | select(.key | contains("TileServerApiUrl")) | .value' 2>/dev/null | head -1)

        if [[ -n "${tile_server_url}" ]]; then
            # Remove trailing slash if present
            tile_server_url="${tile_server_url%/}"
            log_info "      Injecting tile server API URL: ${tile_server_url}" >&2

            config=$(echo "${config}" | jq \
                --arg url "${tile_server_url}" \
                '.dataplaneConfig.TILE_SERVER_URL = (.dataplaneConfig.TILE_SERVER_URL // $url)')
        fi

        # Extract STAC catalog API URL (public-facing data intake API)
        local stac_catalog_url
        stac_catalog_url=$(echo "${apis_outputs}" | jq -r '[.[]] | add | to_entries[] | select(.key | contains("DataIntakeApiUrl")) | .value' 2>/dev/null | head -1)

        if [[ -n "${stac_catalog_url}" ]]; then
            # Remove trailing slash if present
            stac_catalog_url="${stac_catalog_url%/}"
            log_info "      Injecting STAC catalog URL: ${stac_catalog_url}" >&2

            config=$(echo "${config}" | jq \
                --arg url "${stac_catalog_url}" \
                '.dataplaneConfig.STAC_CATALOG_URL = (.dataplaneConfig.STAC_CATALOG_URL // $url)')
        fi

        # Extract geo agents MCP API URL (public-facing)
        local geo_agents_url
        geo_agents_url=$(echo "${apis_outputs}" | jq -r '[.[]] | add | to_entries[] | select(.key | contains("GeoAgentsMcpApiUrl")) | .value' 2>/dev/null | head -1)

        if [[ -n "${geo_agents_url}" ]]; then
            # Remove trailing slash if present
            geo_agents_url="${geo_agents_url%/}"
            log_info "      Injecting geo agents MCP API URL: ${geo_agents_url}" >&2

            config=$(echo "${config}" | jq \
                --arg url "${geo_agents_url}" \
                '.dataplaneConfig.GEO_AGENTS_MCP_URL = (.dataplaneConfig.GEO_AGENTS_MCP_URL // $url)')
        fi

        # Extract data intake output topic ARN
        local data_intake_topic_arn
        data_intake_topic_arn=$(echo "${apis_outputs}" | jq -r '[.[]] | add | to_entries[] | select(.key | contains("DataIntakeOutputTopicArn")) | .value' 2>/dev/null | head -1)

        if [[ -n "${data_intake_topic_arn}" ]]; then
            log_info "      Injecting data intake output topic ARN: ${data_intake_topic_arn}" >&2

            config=$(echo "${config}" | jq \
                --arg arn "${data_intake_topic_arn}" \
                '.dataplaneConfig.DATA_INTAKE_OUTPUT_TOPIC_ARN = (.dataplaneConfig.DATA_INTAKE_OUTPUT_TOPIC_ARN // $arn)')
        fi
    fi

    # Extract model runner outputs from osml-model-runner
    local model_runner_outputs="${COMPONENT_OUTPUTS[osml-model-runner]:-}"
    if [[ -n "${model_runner_outputs}" ]]; then
        log_info "    Injecting outputs from osml-model-runner" >&2

        # Extract model runner image request queue ARN
        local model_runner_queue_arn
        model_runner_queue_arn=$(echo "${model_runner_outputs}" | jq -r '[.[]] | add | to_entries[] | select(.key | contains("ImageRequestQueueArn")) | .value' 2>/dev/null | head -1)

        if [[ -n "${model_runner_queue_arn}" ]]; then
            log_info "      Injecting model runner queue ARN: ${model_runner_queue_arn}" >&2

            config=$(echo "${config}" | jq \
                --arg arn "${model_runner_queue_arn}" \
                '.dataplaneConfig.MODEL_RUNNER_QUEUE_ARN = (.dataplaneConfig.MODEL_RUNNER_QUEUE_ARN // $arn)')
        fi

        # Extract model runner image status topic ARN
        local model_runner_status_topic_arn
        model_runner_status_topic_arn=$(echo "${model_runner_outputs}" | jq -r '[.[]] | add | to_entries[] | select(.key | contains("ImageStatusTopicArn")) | .value' 2>/dev/null | head -1)

        if [[ -n "${model_runner_status_topic_arn}" ]]; then
            log_info "      Injecting model runner status topic ARN: ${model_runner_status_topic_arn}" >&2

            config=$(echo "${config}" | jq \
                --arg arn "${model_runner_status_topic_arn}" \
                '.dataplaneConfig.MODEL_RUNNER_STATUS_TOPIC_ARN = (.dataplaneConfig.MODEL_RUNNER_STATUS_TOPIC_ARN // $arn)')
        fi
    fi

    # Extract workspace bucket name from osml-geo-agents outputs
    local geo_agents_outputs="${COMPONENT_OUTPUTS[osml-geo-agents]:-}"
    if [[ -n "${geo_agents_outputs}" ]]; then
        local workspace_bucket_name
        workspace_bucket_name=$(echo "${geo_agents_outputs}" | jq -r '[.[]] | add | to_entries[] | select(.key | contains("WorkspaceBucketName")) | .value' 2>/dev/null | head -1)

        if [[ -n "${workspace_bucket_name}" ]]; then
            log_info "    Injecting geo-agents workspace bucket: ${workspace_bucket_name}" >&2

            # Ensure stacLoaderConfig exists and inject workspaceBucketName
            config=$(echo "${config}" | jq \
                --arg bucket "${workspace_bucket_name}" \
                '.dataplaneConfig.stacLoaderConfig = (.dataplaneConfig.stacLoaderConfig // {}) | .dataplaneConfig.stacLoaderConfig.workspaceBucketName = (.dataplaneConfig.stacLoaderConfig.workspaceBucketName // $bucket)')
        fi
    fi

    echo "${config}"
}

generate_configs_for_components() {
    local components=("$@")

    if [[ ${#components[@]} -eq 0 ]]; then
        return
    fi

    for component in "${components[@]}"; do
        generate_component_config "${component}"
    done
}


# =============================================================================
# CDK Deployment Functions
# =============================================================================

# Store component outputs for use by downstream waves
store_component_outputs() {
    local component="$1"
    local outputs_file="$2"

    if [[ ! -f "${outputs_file}" ]]; then
        log_info "No outputs file found for ${component}"
        return
    fi

    local outputs
    outputs=$(cat "${outputs_file}")

    COMPONENT_OUTPUTS["${component}"]="${outputs}"
    log_info "Stored outputs for ${component}"

    # Log the outputs
    log_info "Stack outputs for ${component}:"
    local stacks
    stacks=$(echo "${outputs}" | jq -r 'keys[]' 2>/dev/null)

    for stack in ${stacks}; do
        log_info "  Stack: ${stack}"
        local stack_outputs
        stack_outputs=$(echo "${outputs}" | jq -r ".\"${stack}\" | to_entries[] | \"    \\(.key): \\(.value)\"" 2>/dev/null)
        if [[ -n "${stack_outputs}" ]]; then
            echo "${stack_outputs}" | while read -r line; do
                log_info "${line}"
            done
        fi
    done
}

deploy_component_async() {
    local component="$1"
    local temp_dir="$2"
    local component_dir="${ROOT_DIR}/lib/${component}/cdk"
    local outputs_file="${temp_dir}/${component}.outputs"

    if [[ ! -d "${component_dir}" ]]; then
        echo "Component directory not found: ${component_dir}" >&2
        return 1
    fi

    # Install dependencies using package-lock.json for reproducibility
    if [[ -f "${component_dir}/package-lock.json" ]]; then
        if ! (cd "${component_dir}" && npm ci --silent); then
            echo "Failed to install dependencies for ${component}" >&2
            return 1
        fi
    else
        # Fallback to npm install if no lock file exists
        if ! (cd "${component_dir}" && npm install --silent); then
            echo "Failed to install dependencies for ${component}" >&2
            return 1
        fi
    fi

    # Pre-bundle Lambda assets if the component defines a prebundle script.
    # This compiles Lambda code to a .bundle directory without running tsc on the
    # CDK source, preserving compatibility with ts-node based cdk deploy.
    if (cd "${component_dir}" && npm run prebundle:lambda --if-present); then
        : # prebundle succeeded or was skipped (script not defined)
    else
        echo "Failed to prebundle Lambda assets for ${component}" >&2
        return 1
    fi

    # Get retry count from config (0 = no retries, 1 = one retry after failure, etc.)
    local retries
    retries=$(get_component_retries "${component}")
    local max_attempts=$((retries + 1))

    local attempt=1
    while [[ ${attempt} -le ${max_attempts} ]]; do
        if (cd "${component_dir}" && cdk deploy --all --require-approval never --outputs-file "${outputs_file}" 2>&1); then
            return 0
        fi

        if [[ ${attempt} -lt ${max_attempts} ]]; then
            echo "${component} deployment failed (attempt ${attempt}/${max_attempts}), retrying in 30s..." >&2
            sleep 30
        fi
        ((attempt++))
    done

    echo "${component} stack deployment failed after ${max_attempts} attempt(s)" >&2
    return 1
}

deploy_components_parallel() {
    local components=("$@")
    local pids=()
    local temp_dir
    temp_dir=$(mktemp -d)

    # Start all deployments in background
    for component in "${components[@]}"; do
        deploy_component_async "${component}" "${temp_dir}" &
        pids+=($!)
        log_info "Started deployment for ${component} (PID: ${pids[-1]})"
    done

    # Wait for all deployments and collect results
    for i in "${!pids[@]}"; do
        local pid="${pids[$i]}"
        local component="${components[$i]}"
        local output_file="${temp_dir}/${component}.outputs"

        log_info "Waiting for ${component} deployment (PID: ${pid})..."

        if wait "${pid}"; then
            DEPLOYMENT_RESULTS["${component}"]="success"
            log_success "${component} deployment completed successfully"

            if [[ -f "${output_file}" ]]; then
                store_component_outputs "${component}" "${output_file}"
            fi
        else
            DEPLOYMENT_RESULTS["${component}"]="failed"
            log_error "${component} deployment failed"
        fi
    done

    rm -rf "${temp_dir}"
}

deploy_components_sequential() {
    local components=("$@")
    local temp_dir
    temp_dir=$(mktemp -d)

    for component in "${components[@]}"; do
        local output_file="${temp_dir}/${component}.outputs"

        log_operation_start "deploy" "${component}"

        if deploy_component_async "${component}" "${temp_dir}"; then
            DEPLOYMENT_RESULTS["${component}"]="success"
            log_operation_end "deploy" "${component}" "success"

            if [[ -f "${output_file}" ]]; then
                store_component_outputs "${component}" "${output_file}"
            fi
        else
            DEPLOYMENT_RESULTS["${component}"]="failed"
            log_operation_end "deploy" "${component}" "failed"
        fi
    done

    rm -rf "${temp_dir}"
}

# =============================================================================
# Topological Sort Functions
# =============================================================================

# Build the list of components eligible for deployment, applying filters.
# Sets COMPONENT_STATE to "pending" for each eligible component.
build_deploy_candidates() {
    DEPLOY_CANDIDATES=()

    for component in "${COMPONENT_NAMES[@]}"; do
        local deploy_flag
        deploy_flag=$(get_component_deploy_flag "${component}")

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

        DEPLOY_CANDIDATES+=("${component}")
        COMPONENT_STATE["${component}"]="pending"
    done
}

# Get components whose dependencies are all deployed and are ready to deploy.
get_ready_components() {
    READY_COMPONENTS=()

    for component in "${!COMPONENT_STATE[@]}"; do
        if [[ "${COMPONENT_STATE[$component]}" != "pending" ]]; then
            continue
        fi

        local is_blocked=false
        local deps
        deps=$(get_component_dependencies "${component}")

        for dep in ${deps}; do
            local dep_state="${COMPONENT_STATE[$dep]:-}"
            # If the dependency is a candidate and not yet deployed, we're blocked
            if [[ -n "${dep_state}" && "${dep_state}" != "deployed" ]]; then
                is_blocked=true
                break
            fi
            # If the dependency is not a candidate at all, it's either not in config
            # or not enabled — treat as satisfied (it was deployed previously or isn't needed)
        done

        if [[ "${is_blocked}" != "true" ]]; then
            READY_COMPONENTS+=("${component}")
        fi
    done
}

# When a component fails, mark all components that depend on it (transitively) as skipped
mark_dependents_skipped() {
    local failed_component="$1"

    for component in "${!COMPONENT_STATE[@]}"; do
        if [[ "${COMPONENT_STATE[$component]}" != "pending" ]]; then
            continue
        fi

        local deps
        deps=$(get_component_dependencies "${component}")
        for dep in ${deps}; do
            if [[ "${dep}" == "${failed_component}" ]]; then
                COMPONENT_STATE["${component}"]="skipped"
                DEPLOYMENT_RESULTS["${component}"]="skipped"
                log_warn "Skipping ${component}: dependency '${failed_component}' failed"
                # Recursively skip components that depend on this one
                mark_dependents_skipped "${component}"
                break
            fi
        done
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
# Wave Deployment Function
# =============================================================================

# Deploy a wave of components: clone, configure, and deploy
deploy_wave() {
    local wave_num="$1"
    shift
    local components=("$@")

    log_wave "═══════════════════════════════════════════════════════════════"
    log_wave "Starting Wave ${wave_num}"
    log_wave "Components: ${components[*]}"
    log_wave "═══════════════════════════════════════════════════════════════"

    # Record wave assignment for summary display
    for component in "${components[@]}"; do
        COMPONENT_WAVE["${component}"]="${wave_num}"
    done

    # Check component sync status and display warnings (if not force cloning)
    check_and_warn_component_sync "${components[@]}"

    # Clone repositories for this wave (only if --git-clone-force is set)
    clone_components "${components[@]}"

    # Setup model checkpoints (e.g., SAM3 for osml-models)
    if ! setup_osml_models_checkpoint "${components[@]}"; then
        DEPLOYMENT_RESULTS["osml-models"]="failed"
        COMPONENT_STATE["osml-models"]="failed"
        mark_dependents_skipped "osml-models"

        # Remove osml-models from components array
        local updated=()
        for comp in "${components[@]}"; do
            if [[ "${comp}" != "osml-models" ]]; then
                updated+=("${comp}")
            fi
        done
        components=("${updated[@]}")

        if [[ ${#components[@]} -eq 0 ]]; then
            log_warn "No deployable components remaining in wave ${wave_num}"
            return
        fi
    fi

    # Generate configs for this wave
    generate_configs_for_components "${components[@]}"

    # Inject dependency outputs into configs
    for component in "${components[@]}"; do
        inject_dependency_outputs "${component}"
    done

    # Handle dry-run mode
    if [[ "${DRY_RUN}" == "true" ]]; then
        for component in "${components[@]}"; do
            log_info "[DRY-RUN] Would deploy ${component}"
            COMPONENT_STATE["${component}"]="deployed"
            DEPLOYMENT_RESULTS["${component}"]="dry-run"
        done
        return
    fi

    # Handle stage-only mode
    if [[ "${STAGE_ONLY}" == "true" ]]; then
        for component in "${components[@]}"; do
            log_info "[STAGED] ${component} ready for deployment (skipping CDK deploy)"
            COMPONENT_STATE["${component}"]="deployed"
            DEPLOYMENT_RESULTS["${component}"]="staged"
        done
        return
    fi

    # Mark components as deploying
    for component in "${components[@]}"; do
        COMPONENT_STATE["${component}"]="deploying"
    done

    # Deploy components in parallel
    if [[ ${#components[@]} -eq 1 ]]; then
        deploy_components_sequential "${components[@]}"
    else
        log_info "Deploying ${#components[@]} component(s) in parallel..."
        deploy_components_parallel "${components[@]}"
    fi

    # Update component states based on results
    for component in "${components[@]}"; do
        if [[ "${DEPLOYMENT_RESULTS[$component]}" == "success" ]]; then
            COMPONENT_STATE["${component}"]="deployed"
        elif [[ "${DEPLOYMENT_RESULTS[$component]}" == "failed" ]]; then
            COMPONENT_STATE["${component}"]="failed"
            mark_dependents_skipped "${component}"
        fi
    done

    log_wave "Wave ${wave_num} completed"
}


# =============================================================================
# Deployment Summary
# =============================================================================

display_deployment_summary() {
    echo ""
    log_info "════════════════════════════════════════════════════════════════"
    log_info "                    DEPLOYMENT SUMMARY                          "
    log_info "════════════════════════════════════════════════════════════════"

    local success_count=0
    local failed_count=0
    local dry_run_count=0
    local staged_count=0
    local skipped_count=0
    local total_count=0

    for component in "${!DEPLOYMENT_RESULTS[@]}"; do
        local status="${DEPLOYMENT_RESULTS[$component]}"
        ((total_count += 1))
        case "${status}" in
            success) ((success_count += 1)) ;;
            failed) ((failed_count += 1)) ;;
            dry-run) ((dry_run_count += 1)) ;;
            staged) ((staged_count += 1)) ;;
            skipped) ((skipped_count += 1)) ;;
        esac
    done

    if [[ ${total_count} -eq 0 ]]; then
        log_info "No components were deployed."
        log_info "════════════════════════════════════════════════════════════════"
        echo ""
        return
    fi

    log_info "Component Status:"

    # Group components by wave, sorted by wave number then alphabetically within each wave
    local max_wave=0
    for component in "${!DEPLOYMENT_RESULTS[@]}"; do
        local w="${COMPONENT_WAVE[$component]:-0}"
        if [[ ${w} -gt ${max_wave} ]]; then
            max_wave=${w}
        fi
    done

    for ((w=1; w<=max_wave; w++)); do
        local wave_components=()
        for component in "${!DEPLOYMENT_RESULTS[@]}"; do
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
            local status="${DEPLOYMENT_RESULTS[$component]}"
            local git_url
            git_url=$(get_component_git_url "${component}")

            local component_display="${component}"
            if [[ -n "${git_url}" ]]; then
                local git_state
                git_state=$(get_component_git_state "${component}")
                component_display="${component} @ ${git_state}"
            fi

            case "${status}" in
                success)
                    log_success "    ${component_display}: ✓ SUCCESS"
                    ;;
                failed)
                    log_error "    ${component_display}: ✗ FAILED"
                    ;;
                dry-run)
                    log_info "    ${component_display}: ○ DRY-RUN"
                    ;;
                staged)
                    log_info "    ${component_display}: ◉ STAGED"
                    ;;
                skipped)
                    log_warn "    ${component_display}: - SKIPPED (dependency failed)"
                    ;;
            esac
        done
    done

    # Show any skipped components that never entered a wave
    local skipped_no_wave=()
    for component in "${!DEPLOYMENT_RESULTS[@]}"; do
        if [[ "${DEPLOYMENT_RESULTS[$component]}" == "skipped" && -z "${COMPONENT_WAVE[$component]:-}" ]]; then
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
        log_info "Mode: DRY-RUN (no actual deployments performed)"
        log_info "Components that would be deployed: ${dry_run_count}"
    elif [[ "${STAGE_ONLY}" == "true" ]]; then
        log_info "Mode: STAGE (repos cloned, configs generated, no CDK deploy)"
        log_info "Components staged: ${staged_count}"
    else
        log_info "Total: ${total_count}  |  Success: ${success_count}  |  Failed: ${failed_count}  |  Skipped: ${skipped_count}"
    fi

    log_info "════════════════════════════════════════════════════════════════"
    echo ""

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "Dry run completed. Run without -d/--dry-run to deploy."
        return 0
    elif [[ "${STAGE_ONLY}" == "true" ]]; then
        log_info "Staging completed. Repos cloned, configs generated. Run without --stage to deploy."
        return 0
    elif [[ ${failed_count} -gt 0 || ${skipped_count} -gt 0 ]]; then
        log_error "Deployment completed with ${failed_count} failure(s) and ${skipped_count} skipped. Review errors above."
        return 1
    else
        log_success "All ${success_count} component(s) deployed successfully!"
        return 0
    fi
}

# =============================================================================
# Main Function
# =============================================================================
main() {
    log_info "OSML Deployment Script starting"
    log_info "Working directory: ${ROOT_DIR}"

    cd "${ROOT_DIR}"

    read_config "${CONFIG_PATH}"
    populate_component_names

    # Build the list of components to deploy
    build_deploy_candidates

    # Display configuration summary
    log_info "Configuration summary:"
    log_info "  Config file: ${CONFIG_PATH}"
    log_info "  Force clone: ${FORCE_CLONE}"
    log_info "  Dry run: ${DRY_RUN}"
    log_info "  Components to deploy: ${DEPLOY_CANDIDATES[*]}"

    if [[ ${#SELECTED_COMPONENTS[@]} -gt 0 ]]; then
        log_info "  Selected components: ${SELECTED_COMPONENTS[*]}"
    else
        log_info "  Selected components: all enabled"
    fi

    if [[ ${#DEPLOY_CANDIDATES[@]} -eq 0 ]]; then
        log_info "No components to deploy."
        exit ${EXIT_SUCCESS}
    fi

    # Bootstrap CDK toolkit stack (latest) once before parallel deploys to avoid race conditions.
    if [[ "${DRY_RUN}" != "true" && "${STAGE_ONLY}" != "true" ]]; then
        local bootstrap_account bootstrap_region
        bootstrap_account=$(echo "${CONFIG_JSON}" | jq -r '.account.id')
        bootstrap_region=$(echo "${CONFIG_JSON}" | jq -r '.account.region')
        log_info "Bootstrapping CDK environment aws://${bootstrap_account}/${bootstrap_region}"

        if ! cdk bootstrap "aws://${bootstrap_account}/${bootstrap_region}" 2>&1; then
            exit_cdk_error "CDK bootstrap failed for aws://${bootstrap_account}/${bootstrap_region}"
        fi

        log_success "CDK environment bootstrapped successfully"
    fi

    # Execute deployment waves using topological sort
    local wave_num=0

    while has_pending_components; do
        wave_num=$((wave_num + 1))

        get_ready_components

        if [[ ${#READY_COMPONENTS[@]} -eq 0 ]]; then
            log_warn "No more components can be deployed (remaining are blocked by failures or circular dependencies)"
            for component in "${!COMPONENT_STATE[@]}"; do
                if [[ "${COMPONENT_STATE[$component]}" == "pending" ]]; then
                    COMPONENT_STATE["${component}"]="skipped"
                    DEPLOYMENT_RESULTS["${component}"]="skipped"
                fi
            done
            break
        fi

        deploy_wave "${wave_num}" "${READY_COMPONENTS[@]}"
    done

    # Display summary and capture exit status
    local exit_status=0
    if ! display_deployment_summary; then
        exit_status=${EXIT_CDK_ERROR}
    fi

    if [[ ${exit_status} -eq 0 ]]; then
        log_success "OSML Deployment Script completed"
    else
        log_error "OSML Deployment Script completed with failures"
    fi

    exit ${exit_status}
}

# =============================================================================
# Script Entry Point
# =============================================================================
parse_arguments "$@"
main
