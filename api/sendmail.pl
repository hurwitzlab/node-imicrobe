#!/usr/local/bin/perl
use Mail::Sendmail;

sendmail(
    'Subject' => $ARGV[0],
    'To' => $ARGV[1],
    'From' => $ARGV[2],
    'Message' => $ARGV[3]
) or die $Mail::Sendmail::error;

