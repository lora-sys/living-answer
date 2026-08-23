#!/usr/bin/env bash

set -Eeuo pipefail

readonly VITEPLUS_VERSION='0.2.9'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  printf 'living-answer: %s\n' "$1" >&2
  exit 1
}

find_vp() {
  if command -v vp >/dev/null 2>&1; then
    command -v vp
    return 0
  fi

  local viteplus_home="${VP_HOME:-${HOME}/.vite-plus}"
  if [[ -x "${viteplus_home}/bin/vp" ]]; then
    printf '%s\n' "${viteplus_home}/bin/vp"
    return 0
  fi

  return 1
}

cd -- "${REPOSITORY_ROOT}"

command -v curl >/dev/null 2>&1 || fail 'curl is required to install Vite+.'

if ! vp_binary="$(find_vp)"; then
  printf 'Vite+ was not found. Installing global vp v%s...\n' "${VITEPLUS_VERSION}"
  curl -fsSL https://vite.plus | VP_VERSION="${VITEPLUS_VERSION}" bash
  vp_binary="$(find_vp)" || fail 'Vite+ installed, but the vp binary could not be located.'
fi

export PATH="$(dirname -- "${vp_binary}"):${PATH}"

printf 'Using %s\n' "$("${vp_binary}" --version | sed -n '1p')"
printf 'Preparing the project-pinned runtime...\n'
"${vp_binary}" env setup
"${vp_binary}" env install
"${vp_binary}" env doctor

printf 'Installing locked dependencies...\n'
"${vp_binary}" install --frozen-lockfile

printf 'Starting Living Answer. Stop the server with Ctrl+C.\n'
exec "${vp_binary}" dev
