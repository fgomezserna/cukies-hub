#!/bin/sh
set -eu

builder=${BUILDX_BUILDER:-cukies-ci}
registry=${CUKIES_REGISTRY:-192.168.1.207:5000}

if docker buildx inspect "$builder" >/dev/null 2>&1; then
  docker buildx use "$builder"
  docker buildx inspect --bootstrap
  exit 0
fi

config=$(mktemp "${TMPDIR:-/tmp}/cukies-buildkit.XXXXXX.toml")
trap 'rm -f "$config"' EXIT
cat >"$config" <<EOF
[worker.oci]
  max-parallelism = 1
  gc = true

[[worker.oci.gcpolicy]]
  reservedSpace = "10GB"
  maxUsedSpace = "40GB"
  minFreeSpace = "20GB"

[registry."$registry"]
  http = true
  insecure = true
EOF

docker buildx create \
  --name "$builder" \
  --driver docker-container \
  --driver-opt "memory=${CUKIES_BUILDKIT_MEMORY:-9g}" \
  --buildkitd-config "$config" \
  --use
docker buildx inspect --bootstrap
