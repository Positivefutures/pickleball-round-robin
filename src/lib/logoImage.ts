/**
 * The logo, ready to drop into a PDF. Generated — do not edit by hand.
 *
 * Run `node scripts/logo-pdf-asset.mjs` after changing public/logo.png, which
 * is what `sourceSha256` below is taken from. logoImage.test.ts compares that
 * hash against the file on disk, so the two cannot drift apart in silence.
 *
 * Two deflate streams, base64'd: the colour samples, and the alpha channel that
 * becomes the image's /SMask. Raw samples rather than the PNG itself because a
 * PDF reader cannot open a PNG, and decoding one in the browser would mean
 * awaiting before the share sheet is asked for, which iOS does not allow.
 */
export const LOGO_IMAGE = {
  width: 96,
  height: 95,
  /** Deflated 27360 bytes of 8-bit RGB. */
  rgb:
    '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' +
    'svsXp/sfjfaTD9lAxRbJmAKQB9pWE6Oxy+eyGik2EfFJ+Lvulww506zyY/d/TvxyymKxtB/e5bAw2d5MHU2fH9J197o/fApL' +
    'Su0pDjCIJRBARBSJVNd4URM8feY3AeS0GQSQh8UlqW1kPOej1qoS1eRF9lg7IjrPH9Xn0r0jQ5G01j2r/InC4lK0JJ+XXxtO' +
    'Vi4OHfnBw4vcb2qKprwprgSVKiLjUzWJqR5jIfUrVRulSiY9orINeI7FcPVXfWFI/8a5NxWbr/W9HN/eTqYdiKYpsmy6uqzc' +
    'Q8JjJ73hbHCicDOi8QVOYpIWjXTsmlzyj49xh+H6OR/ExjbzafoilrnTxz7bs+fOE4sFT4oOo7Go+TEPXegdu/dQywQyZUwC' +
    'AccHPmocEXVr2zKrI224fKIuxyfhybMlzQzXzvrGZ1vlDvvNyIld5Cx7q6FUEdnvHqX6hgZZWKyT5PS7iPdhmbVaVYqTnpZv' +
    '2orb5+Nf12X7xMc+23/c6xufqW/NdDQqEJV3LkDe3rkLF/vWLPLlOE80MiHFe5vjvLgro1RUPvu+/Q5f3/et0/vHp+XLNb75' +
    'urD90yfrF8Npjlbesg2b+3j5yVOnqauVzSCrrdM3RMlaERxG5XP2/HmLxfJw3Tv+8tm1xEfjQ9a/uEDP+mlO4fg+hIcMz/mg' +
    'MjYlDVcQtU+Wxz4j4pOcIzVFW3u7BcMa303yk0/z1vk+8Fn1aRnpOb/02jDKKRASst6kr693+9pDR46SbyRCleRwcjS+65eL' +
    '8IzOLcTjr5YH+twQv/nM8zznTD5Pzch2KX4R4yXcC7Kp2Dp3KoZh5kxdIRGEwmExNsnR+jHV2tDYBJeTBD4pW48b52N79Dl0' +
    'P/k82um1fl26XNVHlx25TydSlUIm6slxzN5jIILDEtQa3w0y6TMnqwUypUt4gu+5w7CmhTl+wsFd6K/Xeys/7837iFy5Xnp1' +
    'eB/9YwcOHXG5Tum0t4n/ik5I8UihNOl9SE6iWgsqI12ERzd2Ir6C1Fb76Pk4z47j+7wSnqamB4DdDWO62/T04ktDSEexeOJU' +
    '6mtr6/QiGK9HyMJiPJSTBE06Md3A0WhDo+NxOM58Dh05iq/sOxf7D0efTTPe9K45mdo509teDLYYItNcF3+/RC1m8aQoT6pQ' +
    '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' +
    'K40E4khgpgBkiiAGXxLCA/CvaXhCcvJ/ypKiVw==',
  /** Deflated 9120 bytes of 8-bit grey, the alpha channel. */
  alpha:
    'eNq12n9IU1EUB/C72TZ/5sow+mER1R9SVCshoVqGFYIiZRj2g8ISrOiXBSIVGMkqEgmW/cLQqGTLDEMRK4QmiJFFJlKNgpUp' +
    'tUgWNXNtazvxdMM597b73rvn+/8+PB7snnPPeYTQZYZ239nrTW3d3aZmg76sQBNHmCUxu6J1EILiNhuOp8ml43OOmZzAlx+1' +
    'WVGSnrzI5IHwsepXitVnVdqBJp3ZYvR510aANj1bZAL1WJ0DhKRzhSA+7xMIjEs/jVpPuA8iMqCl5Nd9BlHxVEyh0OWnXSA2' +
    'z+dH5BVGkJBvmgh8UgdIij0n/B/2JUiMMz/cIdkDkuPZxcvHvQAGcWbx8KonwCSOtaH9m8Ao1pRQ/CFglt4Q1W21m50PNybx' +
    '8WaGPHhzg/07wDS22RP5XGAc4wQ+5iNr37sp0C8H5jErxvm5dvY+FI/7lxF4GFD6+WSMxwco8vs6FB4svt4ufgjHB1/ftQeJ' +
    'h4djfjuWP5I42iH/w/LhMOefQOPBxPldeL57OiFqvNcDkI9wcgammpDzmP4rQp5i+k4V+Yrpw/IkVB62p+P6pTtw/epSXL+x' +
    'Etdvv4rrv67F9fvqcf23t3D9N8jvv+sirv+4BNev34brVy3D9UtiPah+DrGg+gvJI0zeLienMP0OQjZg+hcIifmL6HOjiFY8' +
    'foS7xxfi+S1c/6l2oPkFo/1/IxY/NHbD24rYfXJRDiL5/sk6Uo/yzH8/VdtQ/I0E9QLcOT4fSP6N4G8OmJ+cRKi8gfMZZR9r' +
    '/s/iCQOm9V7G/rmg+RvjPsUcEzz2b2HJD6dOnswPMPQPhpjfrhpmxt8Nua7azYrvVoYecDMq9f0pfAsAJs3090W8C4YoBreB' +
    'n+nhFjA1Unlb+HWqXCftj9y/NNICbL+UeVDPTIr1oPhy2TiVZv+YLLKhcBygXaDuFTMw7k2l3/+mNAg+0c5EC9owZ74XxDcv' +
    'ELp/VxR+oG/zM8Rs+KN2UlVNb9sasV8oyDLqfkXQv1xKJVISnf+Avy5YazIlfb/h23tqy5oswceG6139EY2MMEtCWt5R3ZXb' +
    'BuO9uqry4pwlKsrf/QdHMIQq',
  /** sha256 of public/logo.png when this was generated. */
  sourceSha256: 'fe14ad7196dcad2605976de485abaef282b52de257769b10c2e56853c6e531e7',
} as const;
