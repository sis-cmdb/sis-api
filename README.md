Table of Contents
=================

TODO - introduce SIS

# API Examples using resty

The following example utilizes [resty](https://github.com/micha/resty), a convenient wrapper around curl.  All sample files are in the [samples](./samples) directory.

```bash
# initialize resty
. resty
resty http://sis.endpoint.com/api/v1 -H "Content-Type: application/json" -H "Accept: application/json"

# assuming we're in the samples directory...

# create a hook that listens for schema inserts - modify this to point to your server if you actually want to receive them.

POST /hooks < hook_schema.json

# create a hook that listens for inserts on the sample entity

POST /hooks < hook_sample.json

# retrieve all the hooks

GET /hooks

# create the sample schema

POST /schemas < schema_sample.json

# create a sample entity

POST /entities/sample < entity_sample.json

# creating it again will fail the unique number test

POST /entities/sample < entity_sample.json

# Create more stuff if you want and then retrieve them.

GET /entities/sample

# Delete the sample schema

DELETE /schemas/sample

# Note that the sample type is now unknown

GET /entities/sample

# Add some hiera data

POST /hiera < hiera_common.json

# note the full object returned.. but get the hiera data for common
# returns just the data portion

GET /hiera/common

# Cleanup

DELETE /hooks/schema_hook_name
DELETE /hooks/sample_hook_name
DELETE /hiera/common

```
